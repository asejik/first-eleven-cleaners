import type { createAdminClient } from '@/lib/supabase/admin';
import { ORDER_TWO_WINDOW_DAYS } from '@/lib/constants';
import { addDaysToDate, dayOfWeek, texasDate } from '@/lib/texas-time';
import { TESTED_MESSAGES, type MessageTests } from '@/lib/message-tests';

/**
 * The Growth panel (client 2026-10-14): "the metric we live by: a customer who completes 2
 * orders in their first 21 days." Each week's new customers are those whose first order (not
 * cancelled) was picked up that week, Monday to Sunday (Dallas). One reached order two when a
 * second order (not cancelled) is picked up within 21 days of the first: the same rule as the
 * $10 order-two discount. A customer whose 21 days haven't ended is "still open" and left out
 * of the rate, so an open week never looks like a final number. Broken down by week, by
 * territory (the first order's address), by rep code (the customer's), and by version A / B of
 * each message test. Reads existing data only. Server only.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const REPORT_WEEK_CHOICES = [4, 8, 12] as const;
export const NO_TERRITORY = 'No territory';
export const NO_CODE = 'No code';

export interface ReportOrder {
  customer_id: string;
  pickup_date: string;
  zip: string | null;
}
export interface ReportSend {
  message_key: string;
  variant: string;
  customer_id: string;
  sent_at: string;
}
export interface ReportInput {
  orders: readonly ReportOrder[];
  /** Customer id to rep code (customers without one can be left out) */
  repCodes: ReadonlyMap<string, string>;
  /** ZIP to territory name */
  territories: ReadonlyMap<string, string>;
  sends: readonly ReportSend[];
  tests: MessageTests;
}

/** One line of a table: new customers, how many reached order two, how many are still open. */
export interface RateLine {
  label: string;
  customers: number;
  reached: number;
  open: number;
  /** reached / decided (customers whose 21 days have ended), or null when none have */
  rate: number | null;
}
export interface WeekLine extends RateLine {
  week: string;
  weekEnd: string;
}
export interface MessageLine {
  key: string;
  label: string;
  A: RateLine;
  B: RateLine;
}
export interface OrderTwoReport {
  weeks: number;
  from: string;
  to: string;
  windowDays: number;
  total: RateLine;
  byWeek: WeekLine[];
  byTerritory: RateLine[];
  byRepCode: RateLine[];
  messages: MessageLine[];
}

/** The Monday of the week a date falls in. */
export function weekOf(date: string): string {
  return addDaysToDate(date, -((dayOfWeek(date) + 6) % 7));
}

interface Journey {
  first: string;
  zip: string | null;
  reached: boolean;
  open: boolean;
}

/** Each customer's first pickup, and whether they reached order two (or are still open). */
export function customerJourneys(orders: readonly ReportOrder[], today: string): Map<string, Journey> {
  const byCustomer = new Map<string, ReportOrder[]>();
  for (const o of orders) {
    if (!o.customer_id || !o.pickup_date) continue;
    const list = byCustomer.get(o.customer_id) ?? [];
    list.push(o);
    byCustomer.set(o.customer_id, list);
  }
  const out = new Map<string, Journey>();
  for (const [id, list] of byCustomer) {
    list.sort((a, b) => a.pickup_date.localeCompare(b.pickup_date));
    const first = list[0];
    const lastDay = addDaysToDate(first.pickup_date, ORDER_TWO_WINDOW_DAYS);
    const reached = list.length > 1 && list[1].pickup_date <= lastDay;
    // A second pickup can still be booked for any day up to the 21st
    out.set(id, { first: first.pickup_date, zip: first.zip, reached, open: !reached && today <= lastDay });
  }
  return out;
}

function tally(label: string, journeys: readonly Journey[]): RateLine {
  const reached = journeys.filter((j) => j.reached).length;
  const open = journeys.filter((j) => j.open).length;
  const decided = journeys.length - open;
  return { label, customers: journeys.length, reached, open, rate: decided > 0 ? Math.round((reached / decided) * 1000) / 10 : null };
}

function grouped(entries: readonly [string, Journey][], keyOf: (id: string, j: Journey) => string): RateLine[] {
  const groups = new Map<string, Journey[]>();
  for (const [id, j] of entries) {
    const key = keyOf(id, j);
    groups.set(key, [...(groups.get(key) ?? []), j]);
  }
  return [...groups.entries()].map(([label, list]) => tally(label, list)).sort((a, b) => b.customers - a.customers || a.label.localeCompare(b.label));
}

/** The report for the last `weeks` weeks (this week included). */
export function buildOrderTwoReport(input: ReportInput, weeks: number, today: string): OrderTwoReport {
  const to = addDaysToDate(weekOf(today), 6);
  const from = addDaysToDate(weekOf(today), -7 * (weeks - 1));
  const journeys = customerJourneys(input.orders, today);
  const cohort = [...journeys.entries()].filter(([, j]) => j.first >= from && j.first <= to);

  const byWeek: WeekLine[] = [];
  for (let week = from; week <= to; week = addDaysToDate(week, 7)) {
    const weekEnd = addDaysToDate(week, 6);
    const line = tally(week, cohort.filter(([, j]) => j.first >= week && j.first <= weekEnd).map(([, j]) => j));
    byWeek.push({ ...line, week, weekEnd });
  }
  byWeek.reverse(); // newest first

  const territoryOf = (zip: string | null) => {
    const zip5 = String(zip || '').replace(/\D/g, '').slice(0, 5);
    return input.territories.get(zip5) ?? NO_TERRITORY;
  };

  // Each customer's first send of a message (since its count started) decides their version
  const messages: MessageLine[] = [];
  for (const info of TESTED_MESSAGES) {
    const countFrom = input.tests[info.key]?.countFrom;
    const firstSend = new Map<string, ReportSend>();
    for (const s of input.sends) {
      if (s.message_key !== info.key || !s.customer_id) continue;
      if (countFrom && Date.parse(s.sent_at) < Date.parse(countFrom)) continue;
      const seen = firstSend.get(s.customer_id);
      if (!seen || Date.parse(s.sent_at) < Date.parse(seen.sent_at)) firstSend.set(s.customer_id, s);
    }
    if (firstSend.size === 0) continue;
    const side = (v: 'A' | 'B') =>
      tally(
        v,
        [...firstSend.values()]
          .filter((s) => (s.variant === 'B' ? 'B' : 'A') === v)
          .map((s) => journeys.get(s.customer_id))
          .filter((j): j is Journey => Boolean(j))
      );
    messages.push({ key: info.key, label: info.label, A: side('A'), B: side('B') });
  }

  return {
    weeks,
    from,
    to,
    windowDays: ORDER_TWO_WINDOW_DAYS,
    total: tally('All', cohort.map(([, j]) => j)),
    byWeek,
    byTerritory: grouped(cohort, (_id, j) => territoryOf(j.zip)),
    byRepCode: grouped(cohort, (id) => input.repCodes.get(id) || NO_CODE),
    messages,
  };
}

const PAGE = 1000;

/** Every row of a query, a page at a time (the API returns at most 1,000 per request). */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await page(start, start + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

type One<T> = T | T[] | null | undefined;
const firstOf = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] : v) ?? null;

/** Loads what the report needs and builds it. */
export async function loadOrderTwoReport(supabase: AdminClient, weeks: number, tests: MessageTests, now: Date = new Date()): Promise<OrderTwoReport> {
  const [orders, customers, zips, territories, sends] = await Promise.all([
    allRows((a, b) =>
      supabase.from('orders').select('id, customer_id, pickup_date, address:addresses(zip)').neq('status', 'cancelled').not('customer_id', 'is', null).order('id').range(a, b)
    ),
    allRows((a, b) => supabase.from('customers').select('id, rep_code').not('rep_code', 'is', null).order('id').range(a, b)),
    allRows((a, b) => supabase.from('territory_zips').select('zip, territory_id').order('zip').range(a, b)),
    allRows((a, b) => supabase.from('territories').select('id, name').order('id').range(a, b)),
    allRows((a, b) => supabase.from('message_sends').select('id, message_key, variant, customer_id, sent_at').not('customer_id', 'is', null).order('id').range(a, b)),
  ]);
  const names = new Map(territories.map((t) => [t.id, t.name]));
  return buildOrderTwoReport(
    {
      orders: orders.map((o) => ({ customer_id: o.customer_id as string, pickup_date: o.pickup_date, zip: firstOf(o.address as One<{ zip: string | null }>)?.zip ?? null })),
      repCodes: new Map(customers.filter((c) => c.rep_code).map((c) => [c.id, c.rep_code as string])),
      territories: new Map(zips.map((z) => [z.zip, names.get(z.territory_id) ?? NO_TERRITORY])),
      sends: sends.map((s) => ({ message_key: s.message_key, variant: s.variant, customer_id: s.customer_id as string, sent_at: s.sent_at })),
      tests,
    },
    weeks,
    texasDate(now)
  );
}
