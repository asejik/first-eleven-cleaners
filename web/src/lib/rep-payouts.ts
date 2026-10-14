import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';
import { addDaysToDate, dayOfWeek, texasDate, texasDayStartUtc } from '@/lib/texas-time';
import { reportError } from '@/lib/error-reporting';
import { territoryForZip } from '@/lib/founding';

/**
 * The weekly payout report (client 2026-10-14). "Verified" means captured, not booked: a
 * customer's first order on a rep code is recorded when the card is actually charged
 * (rep_conversions, one per customer). Field reps get $10 for every verified first order plus
 * $25 for each of the first 11 in the territory (Starting XI); drivers, whose codes are on the
 * referral cards they leave in bags and lobbies, get $5 per conversion and no Starting XI. "If
 * the order is fully refunded in the same payout week, it drops off." The week is Monday to
 * Sunday (Dallas); the report is ready Monday morning. Once a week has closed nothing can drop
 * off it, so a paid week never changes. Server only.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const STARTING_XI = 11;
export type RepKind = 'field' | 'driver';

export interface RepRates {
  fieldPerOrder: number;
  startingXiBonus: number;
  driverPerOrder: number;
}
export const DEFAULT_REP_RATES: RepRates = { fieldPerOrder: 10, startingXiBonus: 25, driverPerOrder: 5 };

const RATES_KEY = 'rep_rates';

export async function getRepRates(supabase: AdminClient): Promise<RepRates> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', RATES_KEY).maybeSingle();
  const saved = (data?.value ?? {}) as Partial<Record<keyof RepRates, unknown>>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  return {
    fieldPerOrder: num(saved.fieldPerOrder, DEFAULT_REP_RATES.fieldPerOrder),
    startingXiBonus: num(saved.startingXiBonus, DEFAULT_REP_RATES.startingXiBonus),
    driverPerOrder: num(saved.driverPerOrder, DEFAULT_REP_RATES.driverPerOrder),
  };
}

export async function saveRepRates(supabase: AdminClient, rates: RepRates, by: string): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: RATES_KEY, value: rates as unknown as Json, updated_at: new Date().toISOString(), updated_by: by });
  if (error) throw error;
}

/** The Monday (Dallas date) of the payout week a moment falls in. */
export function payoutWeekOf(when: Date | string): string {
  const date = texasDate(typeof when === 'string' ? new Date(when) : when);
  const dow = dayOfWeek(date); // 0 = Sunday
  return addDaysToDate(date, -((dow + 6) % 7));
}

/** The week the report opens on: the one just ended (on a Monday morning, last week). */
export function lastClosedWeek(now: Date = new Date()): string {
  return addDaysToDate(payoutWeekOf(now), -7);
}

type One<T> = T | T[] | null | undefined;
const firstOf = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * The card was charged: if this is the customer's first order and they carry a rep code,
 * record the verified first order (once per customer). Never stops the charge it follows.
 */
export async function recordRepConversion(supabase: AdminClient, orderId: string, now: Date = new Date()): Promise<void> {
  try {
    const { data: order } = await supabase
      .from('orders')
      .select('id, customer_id, rep_code, created_at, address:addresses(zip), customer:customers!customer_id(rep_code)')
      .eq('id', orderId)
      .maybeSingle();
    if (!order?.customer_id) return;
    // The code stamped on the customer (the first one they used), else the one on this order
    const code = firstOf(order.customer as One<{ rep_code: string | null }>)?.rep_code || order.rep_code;
    if (!code) return;
    // Their first order: nothing earlier that wasn't cancelled
    const { data: earlier } = await supabase
      .from('orders')
      .select('id')
      .eq('customer_id', order.customer_id)
      .neq('status', 'cancelled')
      .lt('created_at', order.created_at)
      .limit(1);
    if (earlier && earlier.length > 0) return;
    const { data: rep } = await supabase.from('reps').select('code, kind, territory_id').eq('code', code).maybeSingle();
    if (!rep) return;
    const zip = firstOf(order.address as One<{ zip: string | null }>)?.zip;
    const territory = (zip ? await territoryForZip(supabase, zip) : null)?.id ?? rep.territory_id;
    await supabase
      .from('rep_conversions')
      .upsert(
        { customer_id: order.customer_id, order_id: order.id, rep_code: rep.code, rep_kind: rep.kind === 'driver' ? 'driver' : 'field', territory_id: territory, captured_at: now.toISOString() },
        { onConflict: 'customer_id', ignoreDuplicates: true }
      );
  } catch (err) {
    reportError('rep-payouts', err, { details: `Order ${orderId}: verified first order not recorded for the payout report` });
  }
}

/** The order was fully refunded: note when, so the report can drop it in its own week. */
export async function markRepConversionRefunded(supabase: AdminClient, orderId: string, now: Date = new Date()): Promise<void> {
  try {
    await supabase.from('rep_conversions').update({ refunded_at: now.toISOString() }).eq('order_id', orderId).is('refunded_at', null);
  } catch (err) {
    reportError('rep-payouts', err, { details: `Order ${orderId}: refund not noted for the payout report` });
  }
}

export interface Conversion {
  id: string;
  customer_id: string;
  order_id: string;
  rep_code: string;
  rep_kind: string;
  territory_id: string | null;
  captured_at: string;
  refunded_at: string | null;
}

/** Fully refunded in the same payout week it was verified: it drops off. */
export function droppedOff(c: Pick<Conversion, 'captured_at' | 'refunded_at'>): boolean {
  return Boolean(c.refunded_at) && payoutWeekOf(c.refunded_at!) === payoutWeekOf(c.captured_at);
}

/** Starting XI: the first 11 field-rep conversions per territory that didn't drop off, numbered 1-11. */
export function startingXi(conversions: readonly Conversion[]): Map<string, number> {
  const numbers = new Map<string, number>();
  const counts = new Map<string, number>();
  const ordered = [...conversions]
    .filter((c) => c.rep_kind === 'field' && c.territory_id && !droppedOff(c))
    .sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at) || a.id.localeCompare(b.id));
  for (const c of ordered) {
    const n = (counts.get(c.territory_id!) || 0) + 1;
    if (n > STARTING_XI) continue;
    counts.set(c.territory_id!, n);
    numbers.set(c.id, n);
  }
  return numbers;
}

export interface PayoutRow {
  code: string;
  repName: string;
  kind: RepKind;
  territoryId: string;
  signups: number;
  verified: number;
  startingXi: number[];
  cardConversions: number;
  amount: number;
}

export interface PayoutReport {
  week: string;
  weekEnd: string;
  rates: RepRates;
  rows: PayoutRow[];
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One payout week (its Monday), per rep code. */
export async function buildPayoutReport(supabase: AdminClient, week: string): Promise<PayoutReport> {
  const weekEnd = addDaysToDate(week, 6);
  const from = texasDayStartUtc(week);
  const to = texasDayStartUtc(addDaysToDate(week, 7));
  const [rates, { data: reps }, { data: conversions }, { data: signups }] = await Promise.all([
    getRepRates(supabase),
    supabase.from('reps').select('code, rep_name, kind, territory_id').order('code'),
    // Every conversion up to the end of the week: Starting XI counts from the very first
    supabase.from('rep_conversions').select('id, customer_id, order_id, rep_code, rep_kind, territory_id, captured_at, refunded_at').lt('captured_at', to).limit(50000),
    supabase.from('customers').select('rep_code, rep_code_at').gte('rep_code_at', from).lt('rep_code_at', to).limit(20000),
  ]);
  const all = (conversions || []) as Conversion[];
  const xi = startingXi(all);
  const [fromMs, toMs] = [Date.parse(from), Date.parse(to)];
  const inWeek = all.filter((c) => Date.parse(c.captured_at) >= fromMs && Date.parse(c.captured_at) < toMs && !droppedOff(c));

  const rows: PayoutRow[] = (reps || []).map((r) => {
    const kind: RepKind = r.kind === 'driver' ? 'driver' : 'field';
    const mine = inWeek.filter((c) => c.rep_code === r.code);
    const numbers = mine.map((c) => xi.get(c.id)).filter((n): n is number => n !== undefined).sort((a, b) => a - b);
    const verified = kind === 'field' ? mine.length : 0;
    const cardConversions = kind === 'driver' ? mine.length : 0;
    const amount = kind === 'field' ? verified * rates.fieldPerOrder + numbers.length * rates.startingXiBonus : cardConversions * rates.driverPerOrder;
    return {
      code: r.code,
      repName: r.rep_name,
      kind,
      territoryId: r.territory_id,
      signups: (signups || []).filter((s) => s.rep_code === r.code).length,
      verified,
      startingXi: numbers,
      cardConversions,
      amount: round2(amount),
    };
  });
  const active = rows.filter((r) => r.signups || r.verified || r.cardConversions);
  return { week, weekEnd, rates, rows: active, total: round2(active.reduce((sum, r) => sum + r.amount, 0)) };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s;
};

/** The report as a spreadsheet (CSV). */
export function payoutReportCsv(report: PayoutReport): string {
  const head = ['Week', 'Rep code', 'Rep', 'Type', 'Signups', 'Verified first orders', 'Starting XI', 'Referral-card conversions', 'Payout ($)'];
  const lines = report.rows.map((r) =>
    [
      `${report.week} to ${report.weekEnd}`,
      r.code,
      r.repName,
      r.kind === 'driver' ? 'Driver' : 'Field rep',
      r.signups,
      r.verified,
      r.startingXi.length ? r.startingXi.map((n) => `#${n}`).join(' ') : 0,
      r.cardConversions,
      r.amount.toFixed(2),
    ]
      .map(csvCell)
      .join(',')
  );
  lines.push(['', '', '', '', '', '', '', 'Total', report.total.toFixed(2)].map(csvCell).join(','));
  return [head.join(','), ...lines].join('\n') + '\n';
}
