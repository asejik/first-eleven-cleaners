import type { createAdminClient } from '@/lib/supabase/admin';
import { addDaysToDate, texasDate } from '@/lib/texas-time';
import { HOLD_LEAD_DAYS } from '@/lib/payment-hold';
import { notifyOrderCustomer } from '@/lib/daily-jobs';
import { reportError } from '@/lib/error-reporting';
import { getAppBaseUrl, SUPPORT_PHONE, type ExtendedReachConfig } from '@/lib/constants';
import { extendedReachRunDates, earliestExtendedReachRun, formatLongDate, zoneDeliveryDate, dispatchThresholdMessage, DEFAULT_COVERAGE, type Coverage } from '@/lib/coverage';

/**
 * Zone 5 dispatch threshold (client 2026-10-07, 8D). A run (one route day per band) goes out
 * once enough orders are booked: Band A at 3, Band B at 4 (Routine members count like anyone).
 * - The moment a booking reaches the threshold, everyone in the run is told the date.
 * - Two days before the run (the daily job, before card holds are placed), a run still below
 *   its threshold rolls to the next run: each order moves, and its customer is told.
 * - Mission Control can "dispatch anyway" below the threshold.
 */
type AdminClient = ReturnType<typeof createAdminClient>;
export type Band = 'A' | 'B';

export function bandThreshold(reach: ExtendedReachConfig, band: Band): number {
  return reach.bands.find((b) => b.id === band)?.dispatchThreshold ?? 1;
}

/** Orders booked into a run (not cancelled). */
export async function runBookingCount(supabase: AdminClient, runDate: string, band: Band): Promise<number> {
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('pickup_date', runDate)
    .eq('extended_reach_band', band)
    .neq('status', 'cancelled');
  return count ?? 0;
}

export async function isRunDispatched(supabase: AdminClient, runDate: string, band: Band): Promise<boolean> {
  const { data } = await supabase.from('route_cycles').select('status').eq('run_date', runDate).eq('band', band).maybeSingle();
  return data?.status === 'dispatched';
}

/**
 * Marks a run dispatched when it has reached its threshold (or `force`, Mission Control's
 * "dispatch anyway") and tells its customers the date, once. Returns whether it is dispatched.
 */
export async function dispatchRunIfReady(
  supabase: AdminClient,
  { runDate, band, reach, force = false, actor = 'Booking threshold' }: { runDate: string; band: Band; reach: ExtendedReachConfig; force?: boolean; actor?: string }
): Promise<{ dispatched: boolean; booked: number; threshold: number; notified: number }> {
  const threshold = bandThreshold(reach, band);
  const booked = await runBookingCount(supabase, runDate, band);
  const { data: cycle } = await supabase.from('route_cycles').select('status, notified_at').eq('run_date', runDate).eq('band', band).maybeSingle();
  const alreadyDispatched = cycle?.status === 'dispatched';
  if (!alreadyDispatched && !force && booked < threshold) return { dispatched: false, booked, threshold, notified: 0 };

  if (!alreadyDispatched) {
    await supabase.from('route_cycles').upsert({
      run_date: runDate,
      band,
      status: 'dispatched',
      dispatched_at: new Date().toISOString(),
      dispatched_by: actor,
    });
  }
  if (cycle?.notified_at) return { dispatched: true, booked, threshold, notified: 0 };

  // Claim the announcement first, so two bookings landing together don't both send it
  const { data: claimed } = await supabase
    .from('route_cycles')
    .update({ notified_at: new Date().toISOString() })
    .eq('run_date', runDate)
    .eq('band', band)
    .is('notified_at', null)
    .select('run_date');
  if (!claimed || claimed.length === 0) return { dispatched: true, booked, threshold, notified: 0 };

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
        `Eleven at First Eleven Cleaners: your Extended Reach route is confirmed. We'll pick up Order #${order.order_number || order.id.slice(0, 8)} on ${formatLongDate(runDate)}. Track it here: ${getAppBaseUrl()}/track/${order.id}`,
        'booked'
      );
      notified += 1;
    } catch (err) {
      reportError('extended-reach/announce', err, { details: `Run ${runDate} band ${band}: confirmation not sent` });
    }
  }
  return { dispatched: true, booked, threshold, notified };
}

export interface RollResult {
  dispatched: number;
  rolled: number;
}

/**
 * Daily job: runs 2 days away (or closer) that are below their threshold and not dispatched
 * move to the next run; runs that reached it are announced. Runs before the card holds.
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

    const nextRun = extendedReachRunDates(addDaysToDate(runDate, 1), 1, reach)[0];
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
        note: `Extended Reach route on ${runDate} had ${outcome.booked} of ${threshold} bookings: pickup moved to the next route on ${nextRun}.`,
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

/** The next runs a Zone 5 customer can book, with how many neighbors have booked each. */
export async function bookableRuns(
  supabase: AdminClient | null,
  { band, coverage, now = new Date(), count = 3 }: { band: Band; coverage: Coverage; now?: Date; count?: number }
): Promise<Array<{ date: string; booked: number; threshold: number; dispatched: boolean }>> {
  const reach = coverage.extendedReach;
  const first = earliestExtendedReachRun(texasDate(now), reach);
  const dates = extendedReachRunDates(first, count, reach);
  const threshold = bandThreshold(reach, band);
  if (!supabase) return dates.map((date) => ({ date, booked: 0, threshold, dispatched: false }));
  return Promise.all(
    dates.map(async (date) => {
      const [booked, dispatched] = await Promise.all([runBookingCount(supabase, date, band), isRunDispatched(supabase, date, band)]);
      return { date, booked, threshold, dispatched };
    })
  );
}

export interface RunSummary {
  runDate: string;
  band: Band;
  booked: number;
  threshold: number;
  dispatched: boolean;
  notified: boolean;
}

/** Mission Control's Zone 5 panel: the next runs per band, bookings against the threshold. */
export async function upcomingRunSummaries(supabase: AdminClient, coverage: Coverage, now: Date = new Date(), count = 4): Promise<RunSummary[]> {
  const reach = coverage.extendedReach;
  const dates = extendedReachRunDates(texasDate(now), count, reach);
  const last = dates[dates.length - 1];
  const [{ data: orders }, { data: cycles }] = await Promise.all([
    supabase
      .from('orders')
      .select('pickup_date, extended_reach_band')
      .not('extended_reach_band', 'is', null)
      .neq('status', 'cancelled')
      .gte('pickup_date', dates[0])
      .lte('pickup_date', last)
      .limit(1000),
    supabase.from('route_cycles').select('run_date, band, status, notified_at').gte('run_date', dates[0]).lte('run_date', last),
  ]);
  const summaries: RunSummary[] = [];
  for (const runDate of dates) {
    for (const band of ['A', 'B'] as const) {
      const cycle = (cycles || []).find((c) => c.run_date === runDate && c.band === band);
      summaries.push({
        runDate,
        band,
        booked: (orders || []).filter((o) => o.pickup_date === runDate && o.extended_reach_band === band).length,
        threshold: bandThreshold(reach, band),
        dispatched: cycle?.status === 'dispatched',
        notified: Boolean(cycle?.notified_at),
      });
    }
  }
  return summaries;
}
