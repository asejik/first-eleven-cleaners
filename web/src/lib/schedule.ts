import { texasDateTime, addDaysToDate, dayOfWeek } from '@/lib/texas-time';

/**
 * Pickup scheduling rules (P03 PR-12), in Dallas time. Shared by the booking screen (to
 * show the earliest dates) and /api/bookings (which enforces them).
 *
 * - Standard: at least 2 days' notice; never Sunday. Saturday pickups are allowed.
 * - 24-Hour Express: Mon-Thu morning pickups only (the plant is closed on weekends, so a
 *   Friday pickup can't be delivered Saturday morning). Booked before 7:00 AM on an Express
 *   day: this morning; before 9:00 PM: tomorrow morning; after 9:00 PM: the day after.
 * - Nothing more than 60 days ahead.
 * - Delivery (client 2026-10-06): the plant runs Monday to Friday, so turnaround counts plant
 *   days only. Standard is 2 plant days after pickup, Express 1: Thursday pickups are
 *   delivered Monday (Express: Friday), Friday and Saturday pickups Tuesday.
 */
export type ScheduleTier = 'standard' | 'express_24hr';

const STANDARD_NOTICE_DAYS = 2;
const MAX_DAYS_AHEAD = 60;
const EXPRESS_SAME_DAY_CUTOFF_MIN = 7 * 60;
const EXPRESS_NEXT_DAY_CUTOFF_MIN = 21 * 60;

/** Express pickups run Monday to Thursday. */
export function isExpressPickupDay(date: string): boolean {
  const dow = dayOfWeek(date);
  return dow >= 1 && dow <= 4;
}

const isPlantDay = (date: string) => {
  const dow = dayOfWeek(date);
  return dow >= 1 && dow <= 5;
};

/** Alterations take 3-5 business days; an order with any returns together on the 5th plant day. */
export const ALTERATION_PLANT_DAYS = 5;

/**
 * The date (YYYY-MM-DD) a pickup on this date is delivered: 2 plant days later, Express 1,
 * or 5 when the order has alterations (the whole order returns together).
 */
export function estimatedDeliveryDate(
  pickupDate: string,
  tier: ScheduleTier = 'standard',
  { alterations = false }: { alterations?: boolean } = {}
): string {
  let date = pickupDate;
  let plantDays = alterations ? ALTERATION_PLANT_DAYS : tier === 'express_24hr' ? 1 : 2;
  while (plantDays > 0) {
    date = addDaysToDate(date, 1);
    if (isPlantDay(date)) plantDays -= 1;
  }
  return date;
}

export const SATURDAY_PICKUP_NOTICE = 'Saturday pickups are delivered Tuesday.';

/** True for a Saturday pickup date (YYYY-MM-DD). */
export function isSaturdayPickup(pickupDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(pickupDate) && dayOfWeek(pickupDate) === 6;
}

/** Earliest date (YYYY-MM-DD, Dallas) a pickup of this tier can be booked for. */
export function earliestPickupDate(tier: ScheduleTier, now: Date = new Date()): string {
  const { date: today, minutes } = texasDateTime(now);

  if (tier === 'express_24hr') {
    let addDays: number;
    if (minutes < EXPRESS_SAME_DAY_CUTOFF_MIN && isExpressPickupDay(today)) addDays = 0;
    else if (minutes < EXPRESS_NEXT_DAY_CUTOFF_MIN) addDays = 1;
    else addDays = 2;
    let date = addDaysToDate(today, addDays);
    while (!isExpressPickupDay(date)) date = addDaysToDate(date, 1);
    return date;
  }

  let date = addDaysToDate(today, STANDARD_NOTICE_DAYS);
  if (dayOfWeek(date) === 0) date = addDaysToDate(date, 1);
  return date;
}

export type ScheduleCheck = { ok: true } | { ok: false; error: string };

export function validateSchedule(
  {
    pickupDate,
    pickupWindow,
    tier,
    extraDaysAhead = 0,
  }: {
    pickupDate: string;
    pickupWindow: string;
    tier: ScheduleTier;
    /** Founding members see each route day's windows a day before everyone else (2026-10-10) */
    extraDaysAhead?: number;
  },
  now: Date = new Date()
): ScheduleCheck {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) || addDaysToDate(pickupDate, 0) !== pickupDate) {
    return { ok: false, error: 'Please choose a valid pickup date.' };
  }

  const today = texasDateTime(now).date;
  if (pickupDate < today) {
    return { ok: false, error: 'Pickup date cannot be in the past. Please select an upcoming service date.' };
  }
  if (pickupDate > addDaysToDate(today, MAX_DAYS_AHEAD + extraDaysAhead)) {
    return { ok: false, error: `Pickups can be booked up to ${MAX_DAYS_AHEAD} days ahead. Please choose an earlier date.` };
  }
  if (dayOfWeek(pickupDate) === 0) {
    return { ok: false, error: 'Our processing hub is closed on Sundays for maintenance. Please choose Monday through Saturday.' };
  }

  if (tier === 'express_24hr') {
    if (!isExpressPickupDay(pickupDate)) {
      return { ok: false, error: '24-Hour Express pickups run Monday through Thursday. Please choose one of those days or 48-Hour Standard.' };
    }
    if (pickupWindow !== 'morning') {
      return { ok: false, error: '24-Hour Express is a morning pickup. Please choose the morning window.' };
    }
  }

  const earliest = earliestPickupDate(tier, now);
  if (pickupDate < earliest) {
    return {
      ok: false,
      error:
        tier === 'express_24hr'
          ? `The earliest 24-Hour Express pickup available now is ${earliest}.`
          : `Standard pickups need two days' notice. The earliest available date is ${earliest}.`,
    };
  }
  return { ok: true };
}
