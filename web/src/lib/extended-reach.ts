import type { createAdminClient } from '@/lib/supabase/admin';
import { addDaysToDate, texasDate } from '@/lib/texas-time';
import { HOLD_LEAD_DAYS } from '@/lib/payment-hold';
import { notifyOrderCustomer } from '@/lib/daily-jobs';
import { reportError } from '@/lib/error-reporting';
import { getAppBaseUrl, SUPPORT_PHONE, extendedReachTurnaroundLine, type ExtendedReachConfig } from '@/lib/constants';
import {
  extendedReachRunDates,
  earliestExtendedReachRun,
  nextExtendedReachRun,
  formatLongDate,
  zoneDeliveryDate,
  dispatchThresholdMessage,
  DEFAULT_COVERAGE,
  type Coverage,
} from '@/lib/coverage';

/**
 * Zone 5 runs (client 2026-10-07, revised). Zone 5 runs weekly on Wednesdays: clothes picked
 * up on a run come back on the next run, so a run always goes out when deliveries are due.
 * The threshold (Band A 3, Band B 4) gates NEW pickups only: a run accepts pickups once that
 * many are booked OR a delivery is already due that day.
 * - The moment a run goes out (threshold reached), everyone picked up on it is told the date.
 * - Two days before the run (the daily job, before card holds are placed), pickups on a run
 *   with no delivery due and below its threshold move to the next run, and are told.
 * - Mission Control can "dispatch anyway".
 */
type AdminClient = ReturnType<typeof createAdminClient>;
export type Band = 'A' | 'B';

export function bandThreshold(reach: ExtendedReachConfig, band: Band): number {
  return reach.bands.find((b) => b.id === band)?.dispatchThreshold ?? 1;
}

/** Pickups booked onto a run (not cancelled). */
export async function runBookingCount(supabase: AdminClient, runDate: string, band: Band): Promise<number> {
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('pickup_date', runDate)
    .eq('extended_reach_band', band)
    .neq('status', 'cancelled');
  return count ?? 0;
}

/** Orders coming back on a run (picked up on the run before and not yet delivered). */
export async function runDeliveriesDue(supabase: AdminClient, runDate: string, band: Band): Promise<number> {
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('delivery_date', runDate)
    .eq('extended_reach_band', band)
    .lt('pickup_date', runDate)
    .not('status', 'in', '(cancelled,delivered,booked)');
  return count ?? 0;
}

export async function isRunDispatched(supabase: AdminClient, runDate: string, band: Band): Promise<boolean> {
  const { data } = await supabase.from('route_cycles').select('status').eq('run_date', runDate).eq('band', band).maybeSingle();
  return data?.status === 'dispatched';
}

/**
 * Marks a run dispatched when it accepts pickups: its threshold is reached, a delivery is
 * already due that day, or `force` (Mission Control's "dispatch anyway"). Tells the customers
 * picked up on it the date, once. Returns whether it is dispatched.
 */
export async function dispatchRunIfReady(
  supabase: AdminClient,
  { runDate, band, reach, force = false, actor = 'Booking threshold' }: { runDate: string; band: Band; reach: ExtendedReachConfig; force?: boolean; actor?: string }
): Promise<{ dispatched: boolean; booked: number; deliveriesDue: number; threshold: number; notified: number }> {
  const threshold = bandThreshold(reach, band);
  const [booked, deliveriesDue] = await Promise.all([runBookingCount(supabase, runDate, band), runDeliveriesDue(supabase, runDate, band)]);
  const { data: cycle } = await supabase.from('route_cycles').select('status, notified_at').eq('run_date', runDate).eq('band', band).maybeSingle();
  const alreadyDispatched = cycle?.status === 'dispatched';
  if (!alreadyDispatched && !force && booked < threshold && deliveriesDue === 0) {
    return { dispatched: false, booked, deliveriesDue, threshold, notified: 0 };
  }

  if (!alreadyDispatched) {
    await supabase.from('route_cycles').upsert({
      run_date: runDate,
      band,
      status: 'dispatched',
      dispatched_at: new Date().toISOString(),
      dispatched_by: deliveriesDue > 0 && booked < threshold && !force ? 'Delivery run' : actor,
    });
  }
  if (cycle?.notified_at) return { dispatched: true, booked, deliveriesDue, threshold, notified: 0 };

  // Claim the announcement first, so two bookings landing together don't both send it
  const { data: claimed } = await supabase
    .from('route_cycles')
    .update({ notified_at: new Date().toISOString() })
    .eq('run_date', runDate)
    .eq('band', band)
    .is('notified_at', null)
    .select('run_date');
  if (!claimed || claimed.length === 0) return { dispatched: true, booked, deliveriesDue, threshold, notified: 0 };

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, customer:customers!customer_id(full_name, phone, email)')
    .eq('pickup_date', runDate)
    .eq('extended_reach_band', band)
    .neq('status', 'cancelled')
    .limit(100);
  let notified = 0;
  for (const order of orders || []) {
    try {
      await notifyOrderCustomer(
        order,
        '🚐 Your Extended Reach route is confirmed',
        `Eleven at First Eleven Cleaners: your Extended Reach route is confirmed. We'll pick up Order #${order.order_number || order.id.slice(0, 8)} on ${formatLongDate(runDate)} and bring it back on ${formatLongDate(nextExtendedReachRun(runDate, reach))}. Track it here: ${getAppBaseUrl()}/track/${order.id}`,
        'booked'
      );
      notified += 1;
    } catch (err) {
      reportError('extended-reach/announce', err, { details: `Run ${runDate} band ${band}: confirmation not sent` });
    }
  }
  return { dispatched: true, booked, deliveriesDue, threshold, notified };
}

export interface RollResult {
  dispatched: number;
  rolled: number;
}

/**
 * Daily job: pickups on runs 2 days away (or closer) whose run doesn't accept them yet move to
 * the next run; runs that accept them are announced. Runs before the card holds. Deliveries
 * are never moved: a run with deliveries due always goes out.
 */
export async function rollExtendedReachRuns(supabase: AdminClient, coverage: Coverage = DEFAULT_COVERAGE, now: Date = new Date()): Promise<RollResult> {
  const result: RollResult = { dispatched: 0, rolled: 0 };
  const reach = coverage.extendedReach;
  const decisionDate = addDaysToDate(texasDate(now), HOLD_LEAD_DAYS);

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, pickup_date, pickup_window, extended_reach_band, customer:customers!customer_id(full_name, phone, email)')
    .not('extended_reach_band', 'is', null)
    .eq('status', 'booked')
    .lte('pickup_date', decisionDate)
    .order('pickup_date')
    .limit(200);

  const runs = new Map<string, NonNullable<typeof orders>>();
  for (const order of orders || []) {
    const key = `${order.pickup_date}|${order.extended_reach_band}`;
    runs.set(key, [...(runs.get(key) || []), order]);
  }

  for (const [key, runOrders] of runs) {
    const [runDate, band] = key.split('|') as [string, Band];
    if (band !== 'A' && band !== 'B') continue;
    const outcome = await dispatchRunIfReady(supabase, { runDate, band, reach, actor: 'Daily route check' });
    if (outcome.dispatched) {
      result.dispatched += 1;
      continue;
    }

    const nextRun = extendedReachRunDates(addDaysToDate(runDate, 1), 1, reach)[0] ?? nextExtendedReachRun(runDate, reach);
    const threshold = bandThreshold(reach, band);
    for (const order of runOrders) {
      const orderRef = order.order_number || order.id.slice(0, 8);
      const { data: moved } = await supabase
        .from('orders')
        .update({
          pickup_date: nextRun,
          delivery_date: zoneDeliveryDate(coverage.extendedReachZone, nextRun, 'standard', {}, coverage),
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)
        .eq('status', 'booked')
        .eq('pickup_date', runDate)
        .select('id');
      if (!moved || moved.length === 0) continue;
      result.rolled += 1;
      await supabase.from('order_events').insert({
        order_id: order.id,
        status: 'booked',
        note: `Extended Reach run on ${runDate} had ${outcome.booked} of ${threshold} pickups and no delivery due: pickup moved to the next run on ${nextRun}.`,
        triggered_by: 'Daily Route Check',
      });
      await notifyOrderCustomer(
        order,
        '🗓️ Your pickup moved to the next route',
        `Eleven at First Eleven Cleaners: your Extended Reach route on ${formatLongDate(runDate)} didn't reach ${threshold} neighbors, so we've moved your pickup (Order #${orderRef}) to the next route on ${formatLongDate(nextRun)}. ${dispatchThresholdMessage(outcome.booked, threshold)} Nothing is charged until we pick up. Questions? Call ${SUPPORT_PHONE}.`,
        'booked'
      );
    }
  }
  return result;
}

export type BookableRun = { date: string; booked: number; threshold: number; deliveriesDue: number; dispatched: boolean };

/** The next runs a Zone 5 customer can book, with pickups booked and deliveries due on each. */
export async function bookableRuns(
  supabase: AdminClient | null,
  { band, coverage, now = new Date(), count = 3 }: { band: Band; coverage: Coverage; now?: Date; count?: number }
): Promise<BookableRun[]> {
  const reach = coverage.extendedReach;
  const first = earliestExtendedReachRun(texasDate(now), reach);
  if (!first) return [];
  const dates = extendedReachRunDates(first, count, reach);
  const threshold = bandThreshold(reach, band);
  if (!supabase) return dates.map((date) => ({ date, booked: 0, threshold, deliveriesDue: 0, dispatched: false }));
  return Promise.all(
    dates.map(async (date) => {
      const [booked, deliveriesDue, dispatched] = await Promise.all([
        runBookingCount(supabase, date, band),
        runDeliveriesDue(supabase, date, band),
        isRunDispatched(supabase, date, band),
      ]);
      return { date, booked, threshold, deliveriesDue, dispatched: dispatched || deliveriesDue > 0 || booked >= threshold };
    })
  );
}

/** The confirmation's run line: confirmed, or where the threshold stands (this booking included). */
export function runStatusLine(run: { booked: number; threshold: number; deliveriesDue: number; dispatched: boolean }, reach: ExtendedReachConfig): string {
  const turnaround = extendedReachTurnaroundLine(reach);
  if (run.dispatched || run.deliveriesDue > 0 || run.booked >= run.threshold) return `Your Extended Reach route is confirmed. ${turnaround}`;
  return `${dispatchThresholdMessage(run.booked, run.threshold)} ${turnaround}`;
}

export interface RunSummary {
  runDate: string;
  band: Band;
  booked: number;
  deliveriesDue: number;
  threshold: number;
  dispatched: boolean;
  notified: boolean;
}

/** Mission Control's Zone 5 panel: the next runs per band, pickups against the threshold. */
export async function upcomingRunSummaries(supabase: AdminClient, coverage: Coverage, now: Date = new Date(), count = 4): Promise<RunSummary[]> {
  const reach = coverage.extendedReach;
  const dates = extendedReachRunDates(texasDate(now), count, reach);
  if (dates.length === 0) return [];
  const last = dates[dates.length - 1];
  const [{ data: pickups }, { data: deliveries }, { data: cycles }] = await Promise.all([
    supabase
      .from('orders')
      .select('pickup_date, extended_reach_band')
      .not('extended_reach_band', 'is', null)
      .neq('status', 'cancelled')
      .gte('pickup_date', dates[0])
      .lte('pickup_date', last)
      .limit(1000),
    supabase
      .from('orders')
      .select('delivery_date, extended_reach_band')
      .not('extended_reach_band', 'is', null)
      .not('status', 'in', '(cancelled,delivered,booked)')
      .gte('delivery_date', dates[0])
      .lte('delivery_date', last)
      .limit(1000),
    supabase.from('route_cycles').select('run_date, band, status, notified_at').gte('run_date', dates[0]).lte('run_date', last),
  ]);
  const summaries: RunSummary[] = [];
  for (const runDate of dates) {
    for (const band of ['A', 'B'] as const) {
      const cycle = (cycles || []).find((c) => c.run_date === runDate && c.band === band);
      const deliveriesDue = (deliveries || []).filter((o) => o.delivery_date === runDate && o.extended_reach_band === band).length;
      summaries.push({
        runDate,
        band,
        booked: (pickups || []).filter((o) => o.pickup_date === runDate && o.extended_reach_band === band).length,
        deliveriesDue,
        threshold: bandThreshold(reach, band),
        dispatched: cycle?.status === 'dispatched' || deliveriesDue > 0,
        notified: Boolean(cycle?.notified_at),
      });
    }
  }
  return summaries;
}
