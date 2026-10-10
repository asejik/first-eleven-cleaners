import type { createAdminClient } from '@/lib/supabase/admin';
import { addDaysToDate, texasDate } from '@/lib/texas-time';
import { getAppBaseUrl } from '@/lib/constants';
import { resolveCoverage, type Coverage } from '@/lib/coverage';
import { getCoverageSettings, saveCoverageSettings } from '@/lib/coverage-settings';
import { sendContactMessage } from '@/lib/messaging/contact';
import { greetingFirstName } from '@/lib/sanitize';
import { reportError } from '@/lib/error-reporting';

/**
 * Tier-down (client 2026-10-10): busy ZIPs earn a lower minimum, one step at a time, and only
 * with the owner's approval; nothing changes on its own.
 * - A Zone 2-4 ZIP with 20 orders in the trailing 4 weeks is flagged for its next step down
 *   ($100 -> $80 -> $60 -> $45). Each step needs the threshold again, counted from the last
 *   approval. Zone 1 ZIPs are already at $45, so they are never flagged.
 * - A Zone 5 ZIP that reaches it is flagged "Promote to Zone 4?" (it changes the route day and
 *   drops the Extended Reach fee).
 * - Never auto-raised: a stepped-down ZIP under 10 orders in 8 weeks is only flagged for review.
 * All four numbers are editable (coverage settings, tierDown). On approval, everyone with an
 * address in that ZIP gets the "your neighborhood just unlocked" message.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export interface TierFlag {
  zip: string;
  kind: 'tier_down' | 'promote_zone_4' | 'review';
  zoneId: string;
  current: number | null;
  next: number | null;
  orders: number;
  since: string;
}

/** The minimums a ZIP steps down through, highest first ($100, $80, $60, $45). */
export function tierLadder(coverage: Coverage): number[] {
  const values = coverage.zonesList.map((z) => z.minimumOrder);
  return [...new Set(values)].sort((a, b) => b - a);
}

export function nextTier(current: number, coverage: Coverage): number | null {
  return tierLadder(coverage).find((v) => v < current) ?? null;
}

type OrderRow = { pickup_date: string; zone_id: string | null; address: { zip: string } | { zip: string }[] | null };
const zipOf = (o: OrderRow) => (Array.isArray(o.address) ? o.address[0]?.zip : o.address?.zip)?.slice(0, 5) ?? null;

export async function computeTierFlags(supabase: AdminClient, coverage: Coverage, now: Date = new Date()): Promise<TierFlag[]> {
  const today = texasDate(now);
  const t = coverage.tierDown;
  const flagSince = addDaysToDate(today, -7 * t.flagWeeks);
  const reviewSince = addDaysToDate(today, -7 * t.reviewWeeks);
  const earliest = flagSince < reviewSince ? flagSince : reviewSince;

  const [{ data: orders }, { data: steps }] = await Promise.all([
    supabase
      .from('orders')
      .select('pickup_date, zone_id, address:addresses(zip)')
      .neq('status', 'cancelled')
      .gte('pickup_date', earliest)
      .lte('pickup_date', today)
      .limit(20000),
    supabase.from('zip_tier_steps').select('zip, approved_at').order('approved_at', { ascending: false }).limit(5000),
  ]);
  const lastStep = new Map<string, string>();
  for (const s of steps || []) if (!lastStep.has(s.zip)) lastStep.set(s.zip, texasDate(s.approved_at));

  const byZip = new Map<string, OrderRow[]>();
  for (const o of (orders || []) as unknown as OrderRow[]) {
    const zip = zipOf(o);
    if (!zip) continue;
    byZip.set(zip, [...(byZip.get(zip) || []), o]);
  }

  const flags: TierFlag[] = [];
  for (const [zip, rows] of byZip) {
    // Each step needs the threshold again: count from the last approval
    const since = lastStep.has(zip) && lastStep.get(zip)! > flagSince ? lastStep.get(zip)! : flagSince;
    const count = rows.filter((o) => o.pickup_date >= since).length;
    if (count < t.flagOrders) continue;
    const resolved = resolveCoverage({ zip }, coverage);
    const zoneId = resolved.status === 'served' && !resolved.byDistance ? resolved.zone.id : (rows[rows.length - 1].zone_id ?? 'unknown');
    if (zoneId === 'zone_5') {
      flags.push({ zip, kind: 'promote_zone_4', zoneId, current: null, next: null, orders: count, since });
      continue;
    }
    if (zoneId === 'zone_1' || !['zone_2', 'zone_3', 'zone_4'].includes(zoneId)) continue;
    const current = coverage.zipMinimums[zip] ?? coverage.zones[zoneId as 'zone_2' | 'zone_3' | 'zone_4'].minimumOrder;
    const next = nextTier(current, coverage);
    if (next !== null) flags.push({ zip, kind: 'tier_down', zoneId, current, next, orders: count, since });
  }

  // Never raised automatically: a stepped-down ZIP that has gone quiet is flagged for review
  for (const [zip, minimum] of Object.entries(coverage.zipMinimums)) {
    const count = (byZip.get(zip) || []).filter((o) => o.pickup_date >= reviewSince).length;
    if (count < t.reviewOrders) {
      const resolved = resolveCoverage({ zip }, coverage);
      flags.push({ zip, kind: 'review', zoneId: resolved.status === 'served' ? resolved.zone.id : 'unknown', current: minimum, next: null, orders: count, since: reviewSince });
    }
  }
  return flags.sort((a, b) => b.orders - a.orders);
}

/** "Your neighborhood just unlocked": to everyone with an address in the ZIP. */
async function tellNeighborhood(supabase: AdminClient, zip: string, body: (firstName: string) => string, title: string): Promise<number> {
  const { data: addresses } = await supabase.from('addresses').select('customer_id').eq('zip', zip).limit(2000);
  const ids = [...new Set((addresses || []).map((a) => a.customer_id))];
  if (ids.length === 0) return 0;
  const { data: customers } = await supabase.from('customers').select('full_name, phone, email, sms_consent, role').in('id', ids);
  let told = 0;
  for (const c of customers || []) {
    if (c.role && c.role !== 'customer') continue;
    const sent = await sendContactMessage({ phone: c.phone, email: c.email, smsConsent: Boolean(c.sms_consent), title, body: body(greetingFirstName(c.full_name, 'there')) });
    if (sent.ok) told += 1;
  }
  return told;
}

export type ApproveResult = { ok: true; told: number; flag: TierFlag } | { ok: false; error: string };

/** The owner approves a flag: the next step down, or promoting a Zone 5 ZIP to Zone 4. */
export async function approveTierFlag(
  supabase: AdminClient,
  coverage: Coverage,
  { zip, kind, by }: { zip: string; kind: 'tier_down' | 'promote_zone_4'; by: string },
  now: Date = new Date()
): Promise<ApproveResult> {
  const flag = (await computeTierFlags(supabase, coverage, now)).find((f) => f.zip === zip && f.kind === kind);
  if (!flag) return { ok: false, error: `${zip} isn't eligible for that right now. Refresh the list.` };

  const settings = await getCoverageSettings();
  if (kind === 'tier_down') {
    await saveCoverageSettings({ ...settings, zipMinimums: { ...settings.zipMinimums, [zip]: flag.next! } }, by);
  } else {
    const zipMinimums = { ...settings.zipMinimums };
    delete zipMinimums[zip];
    await saveCoverageSettings({ ...settings, zipZones: { ...settings.zipZones, [zip]: 'zone_4' }, zipMinimums }, by);
  }
  await supabase.from('zip_tier_steps').insert({
    zip,
    action: kind,
    from_minimum: flag.current,
    to_minimum: kind === 'tier_down' ? flag.next : coverage.zones.zone_4.minimumOrder,
    orders_counted: flag.orders,
    approved_by: by,
    approved_at: now.toISOString(),
  });

  const link = `${getAppBaseUrl()}/book`;
  const zone4 = coverage.zones.zone_4;
  let told = 0;
  try {
    told =
      kind === 'tier_down'
        ? await tellNeighborhood(
            supabase,
            zip,
            (name) => `First Eleven Cleaners: Good news, ${name}. Your neighborhood just unlocked a lower minimum: pickups in ${zip} now start at $${flag.next!.toFixed(0)}. Book at ${link}. Reply STOP to opt out.`,
            'Your neighborhood just unlocked a lower minimum'
          )
        : await tellNeighborhood(
            supabase,
            zip,
            (name) =>
              `First Eleven Cleaners: Good news, ${name}. Your neighborhood just unlocked our regular routes: pickups in ${zip} now run ${zone4.routeDays.join(' and ')}, with no Extended Reach fee ($${zone4.minimumOrder.toFixed(0)} minimum). Book at ${link}. Reply STOP to opt out.`,
            'Your neighborhood just unlocked our regular routes'
          );
  } catch (err) {
    reportError('tier-down/notify', err, { details: `${zip}: the neighborhood message was not sent` });
  }
  return { ok: true, told, flag };
}
