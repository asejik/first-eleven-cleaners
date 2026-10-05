import { texasDateTime, addDaysToDate, dayOfWeek } from '@/lib/texas-time';

/**
 * Pickup scheduling rules (P03 PR-12), in Dallas time. Shared by the booking screen (to
 * show the earliest dates) and /api/bookings (which enforces them).
 *
 * - Standard: at least 2 days' notice; never Sunday (plant closed).
 * - 24-Hour Express: Mon-Fri morning pickups only. Booked before 7:00 AM on a weekday:
 *   this morning; before 9:00 PM: tomorrow morning; after 9:00 PM: the day after.
 * - Nothing more than 60 days ahead.
 */
export type ScheduleTier = 'standard' | 'express_24hr';

const STANDARD_NOTICE_DAYS = 2;
const MAX_DAYS_AHEAD = 60;
const EXPRESS_SAME_DAY_CUTOFF_MIN = 7 * 60;
const EXPRESS_NEXT_DAY_CUTOFF_MIN = 21 * 60;

const isWeekend = (date: string) => {
  const dow = dayOfWeek(date);
  return dow === 0 || dow === 6;
};

/** Earliest date (YYYY-MM-DD, Dallas) a pickup of this tier can be booked for. */
export function earliestPickupDate(tier: ScheduleTier, now: Date = new Date()): string {
  const { date: today, minutes } = texasDateTime(now);

  if (tier === 'express_24hr') {
    let addDays: number;
    if (minutes < EXPRESS_SAME_DAY_CUTOFF_MIN && !isWeekend(today)) addDays = 0;
    else if (minutes < EXPRESS_NEXT_DAY_CUTOFF_MIN) addDays = 1;
    else addDays = 2;
    let date = addDaysToDate(today, addDays);
    while (isWeekend(date)) date = addDaysToDate(date, 1);
    return date;
  }

  let date = addDaysToDate(today, STANDARD_NOTICE_DAYS);
  if (dayOfWeek(date) === 0) date = addDaysToDate(date, 1);
  return date;
}

export type ScheduleCheck = { ok: true } | { ok: false; error: string };

export function validateSchedule(
  { pickupDate, pickupWindow, tier }: { pickupDate: string; pickupWindow: string; tier: ScheduleTier },
  now: Date = new Date()
): ScheduleCheck {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) || addDaysToDate(pickupDate, 0) !== pickupDate) {
    return { ok: false, error: 'Please choose a valid pickup date.' };
  }

  const today = texasDateTime(now).date;
  if (pickupDate < today) {
    return { ok: false, error: 'Pickup date cannot be in the past. Please select an upcoming service date.' };
  }
  if (pickupDate > addDaysToDate(today, MAX_DAYS_AHEAD)) {
    return { ok: false, error: `Pickups can be booked up to ${MAX_DAYS_AHEAD} days ahead. Please choose an earlier date.` };
  }
  if (dayOfWeek(pickupDate) === 0) {
    return { ok: false, error: 'Our processing hub is closed on Sundays for maintenance. Please choose Monday through Saturday.' };
  }

  if (tier === 'express_24hr') {
    if (isWeekend(pickupDate)) {
      return { ok: false, error: '24-Hour Express pickups run Monday through Friday. Please choose a weekday or 48-Hour Standard.' };
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
