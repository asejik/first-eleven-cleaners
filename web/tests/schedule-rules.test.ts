import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-12: pickup scheduling rules are enforced by the server, in Dallas time.
// ---------------------------------------------------------------------------
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: vi.fn(async () => ({})) } }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));

import { validateSchedule, earliestPickupDate } from '@/lib/schedule';
import { POST as bookingPOST } from '@/app/api/bookings/route';

const at = (iso: string) => new Date(iso);
// Monday 2026-10-05: 6:30 AM, 8:00 AM and 9:30 PM in Dallas (CDT, UTC-5)
const MON_0630 = at('2026-10-05T11:30:00Z');
const MON_0800 = at('2026-10-05T13:00:00Z');
const MON_2130 = at('2026-10-06T02:30:00Z');
const FRI_2200 = at('2026-10-10T03:00:00Z'); // Friday 2026-10-09, 10 PM

describe('Earliest pickup dates (PR-12)', () => {
  it('standard pickups need two days of notice and skip Sunday', () => {
    expect(earliestPickupDate('standard', MON_0800)).toBe('2026-10-07');
    expect(earliestPickupDate('standard', at('2026-10-09T15:00:00Z'))).toBe('2026-10-12'); // Fri → Sun → Mon
  });

  it('Express follows the 7 AM and 9 PM cutoffs on weekdays', () => {
    expect(earliestPickupDate('express_24hr', MON_0630)).toBe('2026-10-05'); // same morning
    expect(earliestPickupDate('express_24hr', MON_0800)).toBe('2026-10-06'); // tomorrow
    expect(earliestPickupDate('express_24hr', MON_2130)).toBe('2026-10-07'); // past 9 PM
    expect(earliestPickupDate('express_24hr', FRI_2200)).toBe('2026-10-12'); // skips the weekend
  });

  it('uses Dallas time even when the server clock is UTC', () => {
    // 02:30 UTC Tuesday is still Monday 9:30 PM in Dallas
    expect(earliestPickupDate('standard', MON_2130)).toBe('2026-10-07');
  });
});

describe('validateSchedule (PR-12)', () => {
  const ok = (r: ReturnType<typeof validateSchedule>) => r.ok;

  it('accepts a normal standard pickup', () => {
    expect(ok(validateSchedule({ pickupDate: '2026-10-08', pickupWindow: 'evening', tier: 'standard' }, MON_0800))).toBe(true);
  });

  it('rejects malformed, past, too-soon, Sunday and far-future dates', () => {
    for (const pickupDate of ['10/08/2026', '2026-13-01', '2026-10-02', '2026-10-06', '2026-10-11', '2027-03-01']) {
      expect(ok(validateSchedule({ pickupDate, pickupWindow: 'morning', tier: 'standard' }, MON_0800))).toBe(false);
    }
  });

  it('rejects Express on Saturday, in the evening, or past its cutoff', () => {
    expect(ok(validateSchedule({ pickupDate: '2026-10-10', pickupWindow: 'morning', tier: 'express_24hr' }, MON_0800))).toBe(false);
    expect(ok(validateSchedule({ pickupDate: '2026-10-06', pickupWindow: 'evening', tier: 'express_24hr' }, MON_0800))).toBe(false);
    expect(ok(validateSchedule({ pickupDate: '2026-10-05', pickupWindow: 'morning', tier: 'express_24hr' }, MON_0800))).toBe(false);
    expect(ok(validateSchedule({ pickupDate: '2026-10-06', pickupWindow: 'morning', tier: 'express_24hr' }, MON_2130))).toBe(false);
  });

  it('accepts Express tomorrow morning when booked before 9 PM', () => {
    expect(ok(validateSchedule({ pickupDate: '2026-10-06', pickupWindow: 'morning', tier: 'express_24hr' }, MON_0800))).toBe(true);
  });
});

describe('Booking API enforces the schedule (PR-12)', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.TZ = 'UTC';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL; // mock mode: no database needed
    delete process.env.SQUARE_ACCESS_TOKEN;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MON_0800);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const book = (schedule: Record<string, unknown>) =>
    bookingPOST(
      new Request('http://localhost/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: { full_name: 'Sched Tester', email: 'sched@example.com', phone: '2145550100' },
          address: { street: '100 Test St', city: 'Dallas', state: 'TX', zip: '75201' },
          services: { type: 'wash_fold', dry_clean_items: [], estimated_weight_lbs: 20 },
          schedule,
        }),
      })
    );

  it('refuses a standard pickup for tomorrow', async () => {
    expect((await book({ pickup_date: '2026-10-06', pickup_window: 'morning', express_tier: 'standard' })).status).toBe(400);
  });

  it('refuses Express on a Saturday and in the evening window', async () => {
    expect((await book({ pickup_date: '2026-10-10', pickup_window: 'morning', express_tier: 'express_24hr' })).status).toBe(400);
    expect((await book({ pickup_date: '2026-10-06', pickup_window: 'evening', express_tier: 'express_24hr' })).status).toBe(400);
  });

  it('accepts a valid Express pickup tomorrow morning', async () => {
    expect((await book({ pickup_date: '2026-10-06', pickup_window: 'morning', express_tier: 'express_24hr' })).status).toBe(200);
  });
});
