import { addDaysToDate, dayOfWeek, texasDate } from '@/lib/texas-time';
import type { Coverage } from '@/lib/coverage';
import { FAILED_PICKUP_FEE, LATE_CANCEL_CUTOFF_HOURS, type ZoneConfig } from '@/lib/constants';
import { isZoneRouteDay } from '@/lib/coverage';

/**
 * The Routine membership (client 2026-10-07, revised; 2026-10-08): a standing pickup at a
 * chosen cadence, day and window. Client-safe rules; the database side is lib/routine-store.ts.
 * - Weekly or Bi-Weekly; status lasts until the customer cancels (no fee).
 * - Skip any pickup (skip never cancels); 3 skips in a row pause the membership.
 * - Pause 1 to 8 weeks without losing status.
 */
export type RoutineCadence = 'weekly' | 'biweekly';
export type RoutineStatus = 'active' | 'paused' | 'cancelled';
export const ROUTINE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export type RoutineDay = (typeof ROUTINE_DAYS)[number];

export const ROUTINE_PATH = '/dashboard/routine';
export const ROUTINE_TERMS_VERSION = '2026-10-10';
export const ROUTINE_MAX_PAUSE_WEEKS = 8;
export const ROUTINE_AUTO_PAUSE_SKIPS = 3;
/** Changes and resumes start this many days ahead at the earliest (the booking notice). */
export const ROUTINE_NOTICE_DAYS = 3;

export const CADENCE_LABEL: Record<RoutineCadence, string> = { weekly: 'Weekly', biweekly: 'Bi-Weekly' };

export function cadenceDays(cadence: RoutineCadence): number {
  return cadence === 'weekly' ? 7 : 14;
}

/** The weekday name of a date ("2026-10-21" -> "Wednesday"). */
export function weekdayName(date: string): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek(date)];
}

/** The pickup after this one. */
export function followingPickup(date: string, cadence: RoutineCadence): string {
  return addDaysToDate(date, cadenceDays(cadence));
}

/** The first `day` on or after `from` that is a route day for the zone (looks 8 weeks ahead). */
export function firstPickupOnOrAfter(from: string, day: string, zone: ZoneConfig, coverage: Coverage): string | null {
  let date = from;
  for (let i = 0; i < 56; i++) {
    if (weekdayName(date) === day && isZoneRouteDay(zone, date, coverage)) return date;
    date = addDaysToDate(date, 1);
  }
  return null;
}

/** The days a member in this zone can choose (Zones 3/4: route days; Zone 5: the run day). */
export function allowedRoutineDays(zone: ZoneConfig, coverage: Coverage): string[] {
  if (zone.id === 'zone_5') return [coverage.extendedReach.routeDay];
  return ROUTINE_DAYS.filter((d) => zone.routeDays.includes(d));
}

export function windowText(window: string): string {
  return window === 'evening' ? '5:00 to 8:00 PM' : '7:30 to 10:00 AM';
}

/** The auto-renewal agreement shown at checkout, as the client approved it (2026-10-10). */
export function routineAgreementText({ cadence, day, window }: { cadence: RoutineCadence; day: string; window: string }): string {
  const every = cadence === 'weekly' ? 'every week' : 'every other week';
  return (
    `Routine membership: we pick up ${every} on ${day}, ${windowText(window)}, at this address, until you cancel. ` +
    'Two days before each pickup we place a hold for the estimate on your saved card and text you; after we weigh and count the order we charge the actual total. ' +
    `Skip any pickup, or pause for up to ${ROUTINE_MAX_PAUSE_WEEKS} weeks, from your dashboard or by replying SKIP. ` +
    `Cancelling or skipping less than ${LATE_CANCEL_CUTOFF_HOURS} hours before your window carries the $${FAILED_PICKUP_FEE.toFixed(0)} late-cancel fee (members get one waived per month). ` +
    `${ROUTINE_AUTO_PAUSE_SKIPS} skips in a row pause the membership. Cancel anytime, no fee.`
  );
}

export interface RoutineMembership {
  id: string;
  customer_id: string;
  status: RoutineStatus;
  cadence: RoutineCadence;
  pickup_day: string;
  pickup_window: string;
  address_id: string | null;
  next_pickup_date: string | null;
  paused_until: string | null;
  consecutive_skips: number;
  template: RoutineTemplate | Record<string, never>;
  created_at: string;
}

/** What each automatic pickup is estimated at: the booking made when joining. */
export interface RoutineTemplate {
  zone_id: string;
  extended_reach_band: string | null;
  order_type: string;
  services: Record<string, unknown>;
}

export type RoutineChange =
  | { action: 'skip' }
  | { action: 'pause'; weeks: number }
  | { action: 'resume' }
  | { action: 'cancel'; reason?: string }
  | { action: 'update'; cadence?: RoutineCadence; pickup_day?: string; pickup_window?: 'morning' | 'evening' };

export type RoutinePatch = Partial<Pick<RoutineMembership, 'status' | 'cadence' | 'pickup_day' | 'pickup_window' | 'next_pickup_date' | 'paused_until' | 'consecutive_skips'>> & {
  cancelled_at?: string | null;
  cancel_reason?: string | null;
};

export type RoutineDecision =
  | { ok: true; patch: RoutinePatch; autoPaused?: boolean; skippedDate?: string }
  | { ok: false; error: string }
  /** Under 2 hours before a pickup already made: the customer confirms the fee first (2026-10-08) */
  | { ok: false; error: string; code: 'LATE_CANCEL_FEE'; fee: number; waived: boolean };

/**
 * What a change does to a membership (pure: the store saves the patch). `zone` is the
 * membership's zone, for the days it may use.
 */
export function decideRoutineChange(m: RoutineMembership, change: RoutineChange, zone: ZoneConfig, coverage: Coverage, now: Date = new Date()): RoutineDecision {
  const today = texasDate(now);
  if (m.status === 'cancelled') return { ok: false, error: 'This membership has been cancelled. Join again from the booking page.' };

  switch (change.action) {
    case 'skip': {
      if (m.status !== 'active' || !m.next_pickup_date) return { ok: false, error: 'There is no upcoming pickup to skip.' };
      const skips = m.consecutive_skips + 1;
      const next = followingPickup(m.next_pickup_date, m.cadence);
      if (skips >= ROUTINE_AUTO_PAUSE_SKIPS) {
        // Three in a row: pause (status kept), until they resume or the longest pause ends
        return {
          ok: true,
          autoPaused: true,
          skippedDate: m.next_pickup_date,
          patch: { consecutive_skips: skips, status: 'paused', paused_until: addDaysToDate(today, ROUTINE_MAX_PAUSE_WEEKS * 7), next_pickup_date: null },
        };
      }
      return { ok: true, skippedDate: m.next_pickup_date, patch: { consecutive_skips: skips, next_pickup_date: next } };
    }
    case 'pause': {
      if (!Number.isInteger(change.weeks) || change.weeks < 1 || change.weeks > ROUTINE_MAX_PAUSE_WEEKS) {
        return { ok: false, error: `Pause for 1 to ${ROUTINE_MAX_PAUSE_WEEKS} weeks.` };
      }
      return { ok: true, patch: { status: 'paused', paused_until: addDaysToDate(today, change.weeks * 7), next_pickup_date: null } };
    }
    case 'resume': {
      if (m.status !== 'paused') return { ok: false, error: 'This membership is not paused.' };
      const next = firstPickupOnOrAfter(addDaysToDate(today, ROUTINE_NOTICE_DAYS), m.pickup_day, zone, coverage);
      if (!next) return { ok: false, error: 'No pickup day is open for your area right now. Please call us.' };
      return { ok: true, patch: { status: 'active', paused_until: null, consecutive_skips: 0, next_pickup_date: next } };
    }
    case 'cancel':
      return {
        ok: true,
        patch: { status: 'cancelled', next_pickup_date: null, paused_until: null, cancelled_at: now.toISOString(), cancel_reason: change.reason?.slice(0, 500) || null },
      };
    case 'update': {
      const day = change.pickup_day ?? m.pickup_day;
      if (!allowedRoutineDays(zone, coverage).includes(day)) {
        return { ok: false, error: `Pickups in your area run on ${allowedRoutineDays(zone, coverage).join(' and ')}.` };
      }
      const patch: RoutinePatch = {
        cadence: change.cadence ?? m.cadence,
        pickup_day: day,
        pickup_window: change.pickup_window ?? m.pickup_window,
      };
      // A new day starts from the next one far enough ahead; same day keeps the schedule
      if (m.status === 'active' && day !== m.pickup_day) {
        const next = firstPickupOnOrAfter(addDaysToDate(today, ROUTINE_NOTICE_DAYS), day, zone, coverage);
        if (!next) return { ok: false, error: 'No pickup day is open for your area right now. Please call us.' };
        patch.next_pickup_date = next;
      }
      return { ok: true, patch };
    }
  }
}
