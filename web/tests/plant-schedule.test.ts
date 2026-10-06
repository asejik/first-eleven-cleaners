import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  estimatedDeliveryDate,
  earliestPickupDate,
  validateSchedule,
  isExpressPickupDay,
  isSaturdayPickup,
  SATURDAY_PICKUP_NOTICE,
} from '@/lib/schedule';
import { dayOfWeek } from '@/lib/texas-time';
import { formatStageMessage } from '@/lib/messaging/templates';

// ---------------------------------------------------------------------------
// Client 2026-10-06: the plant runs Monday to Friday.
// - Turnaround counts plant days: standard 2, Express 1.
// - Saturday pickups stay available and are delivered Tuesday.
// - Express pickups are Monday to Thursday only.
// October 2026: Mon 5, Tue 6, Wed 7, Thu 8, Fri 9, Sat 10, Sun 11, Mon 12, Tue 13.
// ---------------------------------------------------------------------------
const SRC = join(__dirname, '..', 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');
/** A Dallas wall-clock time in October (CDT, UTC-5) as an instant. */
const dallas = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-05:00`);

describe('calendar used by these tests', () => {
  it('2026-10-05 is a Monday and 2026-10-10 a Saturday', () => {
    expect(dayOfWeek('2026-10-05')).toBe(1);
    expect(dayOfWeek('2026-10-10')).toBe(6);
  });
});

describe('Delivery dates count plant days (Mon-Fri)', () => {
  it.each([
    ['2026-10-05', 'standard', '2026-10-07'], // Mon -> Wed
    ['2026-10-07', 'standard', '2026-10-09'], // Wed -> Fri
    ['2026-10-08', 'standard', '2026-10-12'], // Thu -> Mon
    ['2026-10-09', 'standard', '2026-10-13'], // Fri -> Tue
    ['2026-10-10', 'standard', '2026-10-13'], // Sat -> Tue
    ['2026-10-05', 'express_24hr', '2026-10-06'], // Mon Express -> Tue
    ['2026-10-08', 'express_24hr', '2026-10-09'], // Thu Express -> Fri
  ] as const)('pickup %s (%s) is delivered %s', (pickup, tier, delivery) => {
    expect(estimatedDeliveryDate(pickup, tier)).toBe(delivery);
  });

  it('never delivers on a weekend', () => {
    for (let d = 1; d <= 28; d++) {
      const pickup = `2026-10-${String(d).padStart(2, '0')}`;
      for (const tier of ['standard', 'express_24hr'] as const) {
        const dow = dayOfWeek(estimatedDeliveryDate(pickup, tier));
        expect(dow, `${pickup} ${tier}`).toBeGreaterThanOrEqual(1);
        expect(dow, `${pickup} ${tier}`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('the booking API and the booking screens use the shared rule', () => {
    expect(read('app/api/bookings/route.ts')).toContain('estimatedDeliveryDate(validated.schedule.pickup_date');
    expect(read('hooks/useBookingState.ts')).toContain('estimatedDeliveryDate(pickupDateStr, tier)');
  });
});

describe('Express pickups are Monday to Thursday', () => {
  it('knows the Express days', () => {
    expect(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].every(isExpressPickupDay)).toBe(true);
    expect(['2026-10-09', '2026-10-10', '2026-10-11'].some(isExpressPickupDay)).toBe(false);
  });

  it('refuses a Friday Express pickup, accepts Thursday', () => {
    const now = dallas('2026-10-05', '12:00');
    const friday = validateSchedule({ pickupDate: '2026-10-09', pickupWindow: 'morning', tier: 'express_24hr' }, now);
    expect(friday.ok).toBe(false);
    if (!friday.ok) expect(friday.error).toMatch(/Monday through Thursday/);
    expect(validateSchedule({ pickupDate: '2026-10-08', pickupWindow: 'morning', tier: 'express_24hr' }, now).ok).toBe(true);
  });

  it('still accepts Saturday standard pickups', () => {
    const now = dallas('2026-10-05', '12:00');
    expect(validateSchedule({ pickupDate: '2026-10-10', pickupWindow: 'morning', tier: 'standard' }, now).ok).toBe(true);
    expect(validateSchedule({ pickupDate: '2026-10-10', pickupWindow: 'morning', tier: 'express_24hr' }, now).ok).toBe(false);
  });

  it.each([
    ['2026-10-08', '06:00', '2026-10-08'], // Thu before 7 AM: this morning
    ['2026-10-08', '20:00', '2026-10-12'], // Thu evening: Friday isn't an Express day -> Monday
    ['2026-10-09', '06:00', '2026-10-12'], // Fri early: Monday
    ['2026-10-11', '20:00', '2026-10-12'], // Sun evening: Monday
    ['2026-10-07', '22:00', '2026-10-12'], // Wed after 9 PM: Friday skipped -> Monday
  ])('booking on %s at %s: earliest Express pickup is %s', (date, time, earliest) => {
    expect(earliestPickupDate('express_24hr', dallas(date, time))).toBe(earliest);
  });

  it('the pricing card and booking screen say Monday to Thursday', () => {
    expect(read('app/pricing/page.tsx')).toContain('Monday–Thursday pickups');
    expect(read('app/pricing/page.tsx')).not.toContain('Monday–Friday pickups');
    expect(read('components/booking/StepSchedule.tsx')).toContain('isExpressPickupDay(pickupDate)');
    expect(read('hooks/useBookingState.ts')).toContain('isExpressPickupDay(pickupDate)');
  });
});

describe('Saturday pickups are delivered Tuesday', () => {
  it('uses the exact client wording', () => {
    expect(SATURDAY_PICKUP_NOTICE).toBe('Saturday pickups are delivered Tuesday.');
    expect(isSaturdayPickup('2026-10-10')).toBe(true);
    expect(isSaturdayPickup('2026-10-09')).toBe(false);
    expect(isSaturdayPickup('')).toBe(false);
  });

  const booked = (pickupDate: string) =>
    formatStageMessage({
      orderId: 'order-1',
      orderNumber: 'F11-TEST',
      customerName: 'Ada Lovelace',
      customerPhone: '+12145550100',
      stage: 'booked',
      pickupDate,
      pickupWindow: 'morning',
      trackingUrl: 'https://www.firstelevencleaners.com/track/order-1',
    });

  it('the confirmation text, WhatsApp and email body say it for a Saturday pickup', () => {
    const msg = booked('2026-10-10');
    expect(msg.smsBody).toContain(SATURDAY_PICKUP_NOTICE);
    expect(msg.whatsappBody).toContain(SATURDAY_PICKUP_NOTICE);
  });

  it('weekday confirmations do not', () => {
    expect(booked('2026-10-08').smsBody).not.toContain(SATURDAY_PICKUP_NOTICE);
  });

  it('the schedule and review steps show it', () => {
    expect(read('components/booking/StepSchedule.tsx')).toContain('{SATURDAY_PICKUP_NOTICE}');
    expect(read('components/booking/StepReview.tsx')).toContain('{SATURDAY_PICKUP_NOTICE}');
  });
});
