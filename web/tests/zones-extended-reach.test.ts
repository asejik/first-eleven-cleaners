import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client 2026-10-07, request 8: zones by driving distance, Zone 5 Extended Reach
// (fee line, $125 minimum, Routine half price, bi-weekly runs with a dispatch
// threshold), the waitlist beyond 80 miles, Zone 3/4 route days and delivery,
// the Express switch (off), and the coverage settings.
// ---------------------------------------------------------------------------
const dispatch = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: (...a: unknown[]) => dispatch(...(a as [])) } }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));
const reportError = vi.fn();
vi.mock('@/lib/error-reporting', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { calculateOrderFinancials, resolveZoneByZip, EXPRESS_BADGE } from '@/lib/constants';
import {
  DEFAULT_COVERAGE,
  DEFAULT_COVERAGE_SETTINGS,
  buildCoverage,
  mergeCoverageSettings,
  resolveCoverage,
  isZoneRouteDay,
  extendedReachRunDates,
  earliestExtendedReachRun,
  extendedReachFeeLine,
  zoneDeliveryDate,
  dispatchThresholdMessage,
  formatLongDate,
} from '@/lib/coverage';
import { CoverageSettingsSchema } from '@/lib/coverage-settings';
import { drivingMilesFromHub, resolveAddressCoverage } from '@/lib/distance';
import { rollExtendedReachRuns } from '@/lib/extended-reach';
import { formatStageMessage } from '@/lib/messaging/templates';
import { buildElevenSystemPrompt } from '@/lib/ai/systemPrompt';
import { coverageAnswer } from '@/lib/ai';
import { POST as bookingPOST } from '@/app/api/bookings/route';

const served = (zip: string, miles?: number) => {
  const r = resolveCoverage({ zip, miles });
  if (r.status !== 'served') throw new Error(`${zip} not served`);
  return r;
};

describe('Client validation: zones', () => {
  it('Addison -> Zone 1, $45 minimum, daily routes; Express shows only when switched on', () => {
    const r = served('75001');
    expect(r.zone.id).toBe('zone_1');
    expect(r.zone.minimumOrder).toBe(45);
    expect(r.zone.routeDays).toHaveLength(6);
    expect(r.zone.expressEligible).toBe(false); // off until the plant confirms (8E)
    const on = buildCoverage({ ...DEFAULT_COVERAGE_SETTINGS, expressEnabled: true });
    const zone = resolveCoverage({ zip: '75001' }, on);
    expect(zone.status === 'served' && zone.zone.expressEligible).toBe(true);
    expect(zone.status === 'served' && zone.zone.expressLabel).toBe(EXPRESS_BADGE);
    expect(EXPRESS_BADGE).toBe('⚡ 24-Hr Express (Mon–Thu)');
  });

  it('Euless -> Zone 3, $80 minimum, picks up Monday and Thursday only', () => {
    const r = served('76039');
    expect(r.zone.id).toBe('zone_3');
    expect(r.zone.minimumOrder).toBe(80);
    expect(r.zone.routeScheduleLabel).toBe('Scheduled Routes (Mon & Thu)');
    expect(isZoneRouteDay(r.zone, '2026-10-12')).toBe(true); // Monday
    expect(isZoneRouteDay(r.zone, '2026-10-15')).toBe(true); // Thursday
    expect(['2026-10-13', '2026-10-14', '2026-10-16', '2026-10-17'].some((d) => isZoneRouteDay(r.zone, d))).toBe(false);
  });

  it('Flower Mound -> Zone 2, $60 minimum', () => {
    const r = served('75028');
    expect(r.zone.id).toBe('zone_2');
    expect(r.zone.minimumOrder).toBe(60);
  });

  it('the moved cities land in their new zones; Weatherford is no longer Zone 4', () => {
    expect(['75001', '75007', '75080'].map((z) => served(z).zone.id)).toEqual(['zone_1', 'zone_1', 'zone_1']); // Addison, Carrollton, Richardson
    expect(['75057', '75028'].map((z) => served(z).zone.id)).toEqual(['zone_2', 'zone_2']); // Lewisville, Flower Mound
    expect(['76021', '76053', '76039', '75050'].map((z) => served(z).zone.id)).toEqual(['zone_3', 'zone_3', 'zone_3', 'zone_3']);
    expect(served('76086').zone.id).toBe('zone_5'); // Weatherford
    expect(resolveZoneByZip('76086')?.id).toBe('zone_5');
    expect(served('76201').zone.routeDays).toEqual(['Tuesday', 'Friday']); // Zone 4
  });

  it('Weatherford -> Zone 5 Band A: $35 fee, $125 minimum, alternate Wednesdays, "currently X of 3"', () => {
    const r = served('76086');
    expect(r.band?.id).toBe('A');
    expect(r.zone.minimumOrder).toBe(125);
    expect(extendedReachFeeLine(r.band, false)?.fee).toBe(35);
    expect(r.band?.dispatchThreshold).toBe(3);
    const runs = extendedReachRunDates('2026-10-07', 3, DEFAULT_COVERAGE.extendedReach);
    expect(runs).toEqual(['2026-10-21', '2026-11-04', '2026-11-18']);
    expect(runs.every((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 3)).toBe(true);
    expect(dispatchThresholdMessage(2, 3)).toBe('Your route runs when 3 neighbors book. Currently 2 of 3.');
  });

  it('Sherman (about 65 mi) -> Band B: $60 fee, threshold 4; with an active Routine the fee is $30', () => {
    const r = served('75090', 65);
    expect(r.band?.id).toBe('B');
    expect(r.band?.dispatchThreshold).toBe(4);
    expect(extendedReachFeeLine(r.band, false)?.fee).toBe(60);
    expect(extendedReachFeeLine(r.band, true)?.fee).toBe(30);
    expect(extendedReachFeeLine(served('76086').band, true)?.fee).toBe(17.5); // "$35 -> $17.50"
  });

  it('90 miles out -> the waitlist, no booking', () => {
    expect(resolveCoverage({ zip: '75701', miles: 90 })).toEqual({ status: 'waitlist', miles: 90 });
    expect(resolveCoverage({ zip: '90210' }).status).toBe('waitlist');
  });

  it('band edges: 45 mi is still the Metroplex, 60 is Band A, 80 is Band B, 80.1 is the waitlist', () => {
    expect(served('75999', 45).zone.id).toBe('zone_4');
    expect(served('75999', 60).band?.id).toBe('A');
    expect(served('75999', 80).band?.id).toBe('B');
    expect(resolveCoverage({ zip: '75999', miles: 80.1 }).status).toBe('waitlist');
  });
});

describe('Route-day delivery', () => {
  const zone4 = () => served('76201').zone;
  const zone3 = () => served('76039').zone;

  it('Zone 4: a Friday pickup is delivered Tuesday, a Tuesday pickup Friday', () => {
    expect(zoneDeliveryDate(zone4(), '2026-10-09')).toBe('2026-10-13');
    expect(zoneDeliveryDate(zone4(), '2026-10-13')).toBe('2026-10-16');
  });

  it('Zone 3: a Monday pickup is delivered Thursday, a Thursday pickup Monday', () => {
    expect(zoneDeliveryDate(zone3(), '2026-10-12')).toBe('2026-10-15');
    expect(zoneDeliveryDate(zone3(), '2026-10-15')).toBe('2026-10-19');
  });

  it('the confirmation states the delivery day: "delivered Tuesday [date]"', () => {
    const msg = formatStageMessage({
      orderId: 'o1', orderNumber: 'F11-Z4', customerName: 'Ada', customerPhone: '+12145550100', stage: 'booked',
      pickupDate: '2026-10-09', pickupWindow: 'morning', trackingUrl: 'https://x/track/o1',
      deliveredOn: formatLongDate(zoneDeliveryDate(zone4(), '2026-10-09')),
      routeThresholdLine: dispatchThresholdMessage(2, 3),
    });
    expect(msg.smsBody).toContain('Delivered Tuesday, October 13.');
    expect(msg.smsBody).toContain('Currently 2 of 3.');
  });
});

describe('The Extended Reach fee line', () => {
  it('is taxed like any line and never discounted', () => {
    // $125 of garments + $35 fee: fee 3% of $160 = $4.80, tax 8.25% of $164.80 = $13.60
    const f = calculateOrderFinancials({ subtotal: 125, extendedReachFee: 35 });
    expect(f).toMatchObject({ extendedReachFee: 35, netSubtotal: 160, environmentalFee: 4.8, salesTax: 13.6, finalTotal: 178.4 });
    const promo = calculateOrderFinancials({ subtotal: 125, extendedReachFee: 35, discountPercent: 15 });
    expect(promo.promoDiscount).toBe(18.75); // 15% of the garments only
    expect(promo.netSubtotal).toBe(141.25);
  });

  it('shows before any item is added', () => {
    expect(calculateOrderFinancials({ subtotal: 0, extendedReachFee: 35 }).finalTotal).toBeGreaterThan(35);
  });
});

describe('Driving distance from the hub', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it('asks Google for the driving miles from the hub and places Sherman in Band B', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const calls: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
    vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ routes: [{ distanceMeters: Math.round(65 * 1609.344) }] }), { status: 200 });
    });
    const r = await resolveAddressCoverage({ street: '100 N Travis St', city: 'Sherman', zip: '75090' }, DEFAULT_COVERAGE);
    expect(r.status === 'served' && r.band?.id).toBe('B');
    expect(r.status === 'served' && r.miles).toBe(65);
    expect(calls[0].url).toContain('routes.googleapis.com');
    expect(calls[0].headers['X-Goog-FieldMask']).toBe('routes.distanceMeters');
    expect(calls[0].body).toMatchObject({ origin: { address: '18217 Midway Rd, Dallas, TX 75287' }, travelMode: 'DRIVE' });
  });

  it('a Zone 1-4 ZIP needs no lookup', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect((await resolveAddressCoverage({ zip: '75205' }, DEFAULT_COVERAGE)).status).toBe('served');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('when Google fails, booking falls back to the ZIP code and an admin is told', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 403 }));
    expect(await drivingMilesFromHub({ zip: '76086' })).toBeNull();
    expect(reportError).toHaveBeenCalledWith('distance', 'API key not valid', expect.objectContaining({ alert: true }));
    const r = await resolveAddressCoverage({ zip: '76086' }, DEFAULT_COVERAGE);
    expect(r.status === 'served' && r.band?.id).toBe('A');
  });
});

describe('Coverage settings (Mission Control)', () => {
  it('a valid edit passes; bands out of order or a first run on the wrong day are refused', () => {
    expect(CoverageSettingsSchema.safeParse(DEFAULT_COVERAGE_SETTINGS).success).toBe(true);
    const bad = structuredClone(DEFAULT_COVERAGE_SETTINGS);
    bad.extendedReach.bands[0].maxMiles = 70;
    expect(CoverageSettingsSchema.safeParse(bad).success).toBe(false);
    const wrongDay = structuredClone(DEFAULT_COVERAGE_SETTINGS);
    wrongDay.extendedReach.firstRunDate = '2026-10-22'; // a Thursday
    expect(CoverageSettingsSchema.safeParse(wrongDay).success).toBe(false);
  });

  it('saved values apply, and anything malformed keeps its default', () => {
    const merged = mergeCoverageSettings({ zones: { zone_3: { minimumOrder: 90, routeDays: ['Tuesday'] } }, extendedReach: { bands: [{ id: 'A', fee: 40 }], cadenceWeeks: 'x' } });
    expect(merged.zones.zone_3.minimumOrder).toBe(90);
    expect(merged.zones.zone_3.routeDays).toEqual(['Tuesday']);
    expect(merged.extendedReach.bands[0].fee).toBe(40);
    expect(merged.extendedReach.bands[1].fee).toBe(60);
    expect(merged.extendedReach.cadenceWeeks).toBe(2);
    expect(merged.expressEnabled).toBe(false);
    const coverage = buildCoverage(merged);
    expect(coverage.zones.zone_3.routeScheduleLabel).toBe('Scheduled Routes (Tue)');
  });

  it('Zone 5 bookings close 3 days before a run', () => {
    expect(earliestExtendedReachRun('2026-10-18', DEFAULT_COVERAGE.extendedReach)).toBe('2026-10-21');
    expect(earliestExtendedReachRun('2026-10-19', DEFAULT_COVERAGE.extendedReach)).toBe('2026-11-04');
  });
});

describe('Booking API', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.TZ = 'UTC';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL; // mock mode
    delete process.env.SQUARE_ACCESS_TOKEN;
    delete process.env.GOOGLE_MAPS_API_KEY; // Zone 5 towns use their approximate miles
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T13:00:00Z')); // Monday 8 AM Dallas
    dispatch.mockClear();
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.useRealTimers();
  });

  const book = async (zip: string, schedule: Record<string, unknown>, lbs = 42) => {
    const res = await bookingPOST(
      new Request('http://localhost/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: { full_name: 'Zone Tester', email: 'zone@example.com', phone: '2145550100' },
          address: { street: '100 Test St', city: 'Town', state: 'TX', zip },
          services: { type: 'wash_fold', dry_clean_items: [], estimated_weight_lbs: lbs },
          consents: { payment_terms: true },
          schedule: { pickup_window: 'morning', express_tier: 'standard', ...schedule },
        }),
      })
    );
    return { status: res.status, body: await res.json() };
  };

  it('Weatherford books a run date with the $35 fee line and the threshold', async () => {
    const { status, body } = await book('76086', { pickup_date: '2026-10-21' });
    expect(status).toBe(200);
    expect(body.order.extended_reach_fee).toBe(35);
    expect(body.order.zone_id).toBe('zone_5');
    expect(body.route_threshold).toEqual({ booked: 1, threshold: 3 });
    expect(body.order.delivery_date).toBe('2026-10-23');
  });

  it('a Routine member (Bi-Weekly) pays half the fee', async () => {
    const { body } = await book('76086', { pickup_date: '2026-10-21', frequency: 'biweekly' });
    expect(body.order.extended_reach_fee).toBe(17.5);
  });

  it('Zone 5 refuses a day that is not a run, and orders under $125', async () => {
    expect((await book('76086', { pickup_date: '2026-10-28' })).status).toBe(400);
    const small = await book('76086', { pickup_date: '2026-10-21' }, 40); // $120
    expect(small.status).toBe(400);
    expect(small.body.error).toContain('$125.00 minimum');
  });

  it('Euless refuses a Tuesday and books a Monday', async () => {
    expect((await book('76039', { pickup_date: '2026-10-13' })).status).toBe(400);
    expect((await book('76039', { pickup_date: '2026-10-12' })).status).toBe(200);
  });

  it('a Zone 4 Friday pickup is confirmed with its Tuesday delivery', async () => {
    const { status, body } = await book('76201', { pickup_date: '2026-10-09' });
    expect(status).toBe(200);
    expect(body.order.delivery_date).toBe('2026-10-13');
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalled());
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ deliveredOn: 'Tuesday, October 13' }));
  });

  it('an address beyond the routes is sent to the waitlist', async () => {
    const { status, body } = await book('75701', { pickup_date: '2026-10-08' });
    expect(status).toBe(400);
    expect(body.code).toBe('WAITLIST');
    expect(body.error).toContain('Not in your area yet');
  });

  it('Express is refused while the switch is off', async () => {
    const { status, body } = await book('75205', { pickup_date: '2026-10-06', express_tier: 'express_24hr' });
    expect(status).toBe(400);
    expect(body.error).toContain('24-Hour Express is not available');
  });
});

describe('Dispatch threshold: the daily route check', () => {
  type Row = Record<string, unknown>;
  const writes: Array<{ table: string; op: string; values: Row; filters: Row }> = [];
  let ordersInRun: Row[] = [];
  let booked = 0;
  let cycle: Row | null = null;
  const fake = {
    from: (table: string) => {
      let op = 'select';
      let head = false;
      const filters: Row = {};
      const record = (o: string, v: Row) => {
        op = o;
        writes.push({ table, op: o, values: v, filters });
      };
      const b: Record<string, unknown> = {
        select: (_c?: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), b),
        insert: (v: Row) => (record('insert', v), b),
        update: (v: Row) => (record('update', v), b),
        upsert: (v: Row) => (record('upsert', v), b),
        eq: (c: string, v: unknown) => ((filters[c] = v), b),
        neq: () => b,
        not: () => b,
        is: () => b,
        lte: () => b,
        gte: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: table === 'route_cycles' ? cycle : null, error: null }),
        then: (resolve: (r: unknown) => unknown) => {
          const r = head
            ? { count: booked, data: null }
            : op === 'select'
              ? { data: table === 'orders' ? ordersInRun : [] }
              : op === 'update'
                ? { data: [{ id: 'x', run_date: 'x' }] }
                : { data: null };
          return Promise.resolve({ error: null, ...r }).then(resolve);
        },
      };
      return b;
    },
  };
  const order = (id: string) => ({
    id, order_number: `F11-${id}`, pickup_date: '2026-10-21', pickup_window: 'morning', extended_reach_band: 'A',
    customer: { full_name: 'Ada', phone: '+12145550100', email: 'a@example.com' },
  });
  const run = () => rollExtendedReachRuns(fake as never, DEFAULT_COVERAGE, new Date('2026-10-19T14:00:00Z'));

  beforeEach(() => {
    writes.length = 0;
    cycle = null;
    dispatch.mockClear();
  });

  it('below the threshold 2 days before: each booking moves to the next run and is told', async () => {
    ordersInRun = [order('1'), order('2')];
    booked = 2;
    expect(await run()).toEqual({ dispatched: 0, rolled: 2 });
    const moves = writes.filter((w) => w.table === 'orders' && w.op === 'update');
    expect(moves.map((m) => m.values)).toEqual([
      expect.objectContaining({ pickup_date: '2026-11-04', delivery_date: '2026-11-06' }),
      expect.objectContaining({ pickup_date: '2026-11-04', delivery_date: '2026-11-06' }),
    ]);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ customMessage: expect.stringContaining('Currently 2 of 3.') }));
  });

  it('at the threshold: the run is dispatched and everyone in it is told the date', async () => {
    ordersInRun = [order('1'), order('2'), order('3')];
    booked = 3;
    expect(await run()).toEqual({ dispatched: 1, rolled: 0 });
    expect(writes).toContainEqual(expect.objectContaining({ table: 'route_cycles', op: 'upsert', values: expect.objectContaining({ status: 'dispatched' }) }));
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ customTitle: '🚐 Your Extended Reach route is confirmed', customMessage: expect.stringContaining('Wednesday, October 21') }));
  });

  it('a run dispatched anyway (Mission Control) is not rolled', async () => {
    ordersInRun = [order('1')];
    booked = 1;
    cycle = { status: 'dispatched', notified_at: '2026-10-18T10:00:00Z' };
    expect(await run()).toEqual({ dispatched: 1, rolled: 0 });
    expect(writes.some((w) => w.table === 'orders' && w.op === 'update')).toBe(false);
  });
});

describe('Pages, Eleven and the coverage copy', () => {
  const src = (rel: string) => readFileSync(join(__dirname, '..', 'src', ...rel.split('/')), 'utf8');

  it('the coverage page uses the zone settings and the client copy', () => {
    const page = src('app/service-areas/page.tsx');
    expect(page).toContain('Door-to-door courier delivery is complimentary across the entire DFW Metroplex.');
    expect(page).toContain('coverage.zonesList.map');
    expect(page).toContain('See Extended Reach.');
    expect(page).toContain('id="extended-reach"');
    expect(page).not.toContain('ZONES_LIST');
  });

  it('Eleven knows the five zones, the bands, Zone 5 rules and route-day delivery', () => {
    const prompt = buildElevenSystemPrompt(DEFAULT_COVERAGE);
    expect(prompt).toContain('Zone 5 — Extended Reach (beyond the Metroplex): $125.00 order minimum');
    expect(prompt).toContain('45-60 mi $35 (route runs at 3 bookings)');
    expect(prompt).toContain('60-80 mi $60 (route runs at 4 bookings)');
    expect(prompt).toContain('50% off the fee');
    expect(prompt).toContain('a Zone 4 Friday pickup is delivered Tuesday');
    expect(prompt).toContain('Beyond 80 miles');
    expect(prompt).toContain('24-Hour Express is coming soon');
    expect(prompt).not.toContain('18217 Midway');
    expect(coverageAnswer(DEFAULT_COVERAGE)).toContain('Weatherford');
  });
});
