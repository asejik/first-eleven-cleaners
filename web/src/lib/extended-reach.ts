import type { createAdminClient } from '@/lib/supabase/admin';
import { addDaysToDate, texasDate } from '@/lib/texas-time';
import { HOLD_LEAD_DAYS } from '@/lib/payment-hold';
import { notifyOrderCustomer } from '@/lib/daily-jobs';
import { reportError } from '@/lib/error-reporting';
import { getAppBaseUrl, extendedReachTurnaroundLine, type ExtendedReachConfig } from '@/lib/constants';
import { getZone5Messages } from '@/lib/zone5-message-settings';
import { fillZone5Template, shortRunDate, windowLabel, templateCity, templateFirstName, type Zone5MessageKey } from '@/lib/zone5-messages';
import {
  extendedReachRunDates,
  earliestExtendedReachRun,
  nextExtendedReachRun,
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
 * Customers get the client's texts (2026-10-08, lib/zone5-messages.ts, edited in Mission Control):
 * - Booking on a run that isn't confirmed: "on the list".
 * - The moment a run is filled early (or Mission Control dispatches it anyway): "threshold reached".
 * - Monday evening, two days before the run (/api/cron/route-check): runs going out get
 *   "route confirmed"; pickups on a run with no delivery due and below its threshold move to
 *   the next run and get "route not reached". Card holds wait for that decision.
 */
type AdminClient = ReturnType<typeof createAdminClient>;
export type Band = 'A' | 'B';

/** The fields a Zone 5 text needs: the customer, the pickup window and the city. */
const RUN_ORDER_FIELDS =
  'id, order_number, pickup_date, pickup_window, extended_reach_band, customer:customers!customer_id(full_name, phone, email), address:addresses(city)';

type One<T> = T | T[] | null | undefined;
const firstOf = <T,>(value: One<T>): T | null => (Array.isArray(value) ? value[0] : value) ?? null;

export interface RunOrder {
  id: string;
  order_number?: string | null;
  pickup_window?: string | null;
  customer?: One<{ full_name?: string | null; phone?: string | null; email?: string | null }>;
  address?: One<{ city?: string | null }>;
}

const MESSAGE_TITLES: Record<Exclude<Zone5MessageKey, 'waitlistJoined' | 'zone5Open'>, string> = {
  onTheList: "📋 You're on the list for Extended Reach",
  routeConfirmed: '🚐 Your Extended Reach pickup is confirmed',
  routeNotReached: '🗓️ Your Extended Reach pickup moved a week',
  thresholdReached: '🚐 Your Extended Reach route is confirmed',
};

/** Sends one of the client's Zone 5 texts (Mission Control's wording) about an order's run. */
export async function sendRunMessage(
  order: RunOrder,
  key: keyof typeof MESSAGE_TITLES,
  { runDate, nextRun, threshold }: { runDate: string; nextRun: string; threshold: number }
): Promise<void> {
  const messages = await getZone5Messages();
  const text = fillZone5Template(messages[key], {
    'First name': templateFirstName(firstOf(order.customer)?.full_name),
    City: templateCity(firstOf(order.address)?.city),
    date: shortRunDate(runDate),
    'date+7': shortRunDate(nextRun),
    window: windowLabel(order.pickup_window),
    threshold: String(threshold),
    link: `${getAppBaseUrl()}/book`,
  });
  await notifyOrderCustomer(order, MESSAGE_TITLES[key], text, 'booked');
}

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
 * picked up on it, once, with the client's "threshold reached" text when the threshold is
 * reached (`announce: false` skips it: the Monday decision sends "route confirmed" instead).
 * Returns whether it is dispatched.
 */
export async function dispatchRunIfReady(
  supabase: AdminClient,
  {
    runDate,
    band,
    reach,
    force = false,
    actor = 'Booking threshold',
    announce = true,
  }: { runDate: string; band: Band; reach: ExtendedReachConfig; force?: boolean; actor?: string; announce?: boolean }
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
  // "Threshold reached" only when it was: a run going out for a delivery, or dispatched anyway,
  // is confirmed by the Monday evening "route confirmed" text
  if (cycle?.notified_at || !announce || booked < threshold) return { dispatched: true, booked, deliveriesDue, threshold, notified: 0 };

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
    .select(RUN_ORDER_FIELDS)
    .eq('pickup_date', runDate)
    .eq('extended_reach_band', band)
    .neq('status', 'cancelled')
    .limit(100);
  let notified = 0;
  for (const order of orders || []) {
    try {
      await sendRunMessage(order, 'thresholdReached', { runDate, nextRun: nextExtendedReachRun(runDate, reach), threshold });
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
 * The Monday evening decision (client 2026-10-08: "We confirm routes Monday by 6 PM"), for
 * runs `daysAhead` days away or closer that haven't been decided yet: a run that accepts its
 * pickups goes out and everyone on it gets "route confirmed"; otherwise its pickups move to
 * the next run and get "route not reached". Each run is decided once (route_cycles.decided_at).
 * Deliveries are never moved: a run with deliveries due always goes out.
 * The evening job (/api/cron/route-check) decides runs 2 days away; the 9 AM job decides runs
 * 1 day away, only as a safety net if the evening job didn't run.
 */
export async function rollExtendedReachRuns(
  supabase: AdminClient,
  coverage: Coverage = DEFAULT_COVERAGE,
  now: Date = new Date(),
  { daysAhead = HOLD_LEAD_DAYS }: { daysAhead?: number } = {}
): Promise<RollResult> {
  const result: RollResult = { dispatched: 0, rolled: 0 };
  const reach = coverage.extendedReach;
  const decisionDate = addDaysToDate(texasDate(now), daysAhead);

  const { data: orders } = await supabase
    .from('orders')
    .select(RUN_ORDER_FIELDS)
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

    // Decide each run once, even if both jobs (or two servers) get to it
    await supabase.from('route_cycles').upsert({ run_date: runDate, band }, { onConflict: 'run_date,band', ignoreDuplicates: true });
    const { data: claimed } = await supabase
      .from('route_cycles')
      .update({ decided_at: new Date().toISOString() })
      .eq('run_date', runDate)
      .eq('band', band)
      .is('decided_at', null)
      .select('run_date');
    if (!claimed || claimed.length === 0) continue;

    // Going out: "route confirmed" (not "threshold reached") to everyone on it
    const outcome = await dispatchRunIfReady(supabase, { runDate, band, reach, actor: 'Monday route check', announce: false });
    const threshold = bandThreshold(reach, band);
    if (outcome.dispatched) {
      result.dispatched += 1;
      const returnRun = nextExtendedReachRun(runDate, reach);
      for (const order of runOrders) {
        try {
          await sendRunMessage(order, 'routeConfirmed', { runDate, nextRun: returnRun, threshold });
        } catch (err) {
          reportError('extended-reach/confirm', err, { details: `Run ${runDate} band ${band}: "route confirmed" not sent` });
        }
      }
      continue;
    }

    const nextRun = extendedReachRunDates(addDaysToDate(runDate, 1), 1, reach)[0] ?? nextExtendedReachRun(runDate, reach);
    for (const order of runOrders) {
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
        triggered_by: 'Monday Route Check',
      });
      try {
        await sendRunMessage(order, 'routeNotReached', { runDate, nextRun, threshold });
      } catch (err) {
        reportError('extended-reach/roll', err, { details: `Run ${runDate} band ${band}: "route not reached" not sent` });
      }
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

/**
 * A Zone 5 booking on a run that isn't confirmed yet: the client's "you're on the list" text.
 * Called after `dispatchRunIfReady` (so a booking that fills the run gets "threshold reached").
 */
export async function sendOnTheList(
  supabase: AdminClient,
  { orderId, runDate, band, reach }: { orderId: string; runDate: string; band: Band; reach: ExtendedReachConfig }
): Promise<void> {
  const { data: order } = await supabase.from('orders').select(RUN_ORDER_FIELDS).eq('id', orderId).maybeSingle();
  if (!order) return;
  await sendRunMessage(order, 'onTheList', { runDate, nextRun: nextExtendedReachRun(runDate, reach), threshold: bandThreshold(reach, band) });
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
