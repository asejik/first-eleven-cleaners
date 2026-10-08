import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client 2026-10-07, request 8 as revised: ZIP lists rebuilt from the distance
// bands decide Zones 1-4; any other ZIP is placed by driving distance (and
// logged for review); Zone 5 Extended Reach runs weekly on Wednesdays (back the
// next Wednesday); the threshold gates new pickups only (a run always goes out
// when deliveries are due); Zone 5 waits for a first run date set in Mission
// Control; the Express switch stays off.
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
// Records the distance cache and the "placed by distance" log
const dbWrites: Array<{ table: string; values: Record<string, unknown> }> = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: null, error: null }),
        upsert: async (values: Record<string, unknown>) => (dbWrites.push({ table, values }), { error: null }),
      };
      return b;
    },
  }),
}));
// Booking uses the live settings: here, with the first Zone 5 run set to Wednesday, October 21
vi.mock('@/lib/coverage-settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coverage-settings')>();
  const { buildCoverage, DEFAULT_COVERAGE_SETTINGS } = await import('@/lib/coverage');
  const settings = { ...DEFAULT_COVERAGE_SETTINGS, extendedReach: { ...DEFAULT_COVERAGE_SETTINGS.extendedReach, firstRunDate: '2026-10-21' } };
  return { ...actual, getCoverage: async () => buildCoverage(settings), getCoverageSettings: async () => settings };
});

import { calculateOrderFinancials, resolveZoneByZip, EXPRESS_BADGE, extendedReachTurnaroundLine } from '@/lib/constants';
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
  extendedReachStartLine,
  zoneDeliveryDate,
  dispatchThresholdMessage,
  formatLongDate,
  type CoverageSettings,
} from '@/lib/coverage';
import { CoverageSettingsSchema } from '@/lib/coverage-settings';
import { drivingMilesFromHub, resolveAddressCoverage } from '@/lib/distance';
import { rollExtendedReachRuns, dispatchRunIfReady } from '@/lib/extended-reach';
import { formatStageMessage } from '@/lib/messaging/templates';
import { buildElevenSystemPrompt } from '@/lib/ai/systemPrompt';
import { coverageAnswer } from '@/lib/ai';
import { POST as bookingPOST } from '@/app/api/bookings/route';

const LIVE_SETTINGS: CoverageSettings = {
  ...DEFAULT_COVERAGE_SETTINGS,
  extendedReach: { ...DEFAULT_COVERAGE_SETTINGS.extendedReach, firstRunDate: '2026-10-21' },
};
const LIVE = buildCoverage(LIVE_SETTINGS);

const served = (zip: string, miles?: number, coverage = LIVE) => {
  const r = resolveCoverage({ zip, miles }, coverage);
  if (r.status !== 'served') throw new Error(`${zip} not served`);
  return r;
};

describe('Client validation: zones rebuilt from the distance bands', () => {
  it('Plano -> Zone 1 North Core, $45, daily routes; Express shows only when switched on', () => {
    const r = served('75024');
    expect(r.zone).toMatchObject({ id: 'zone_1', name: 'Zone 1 — North Core', minimumOrder: 45 });
    expect(r.zone.routeDays).toHaveLength(6);
    expect(r.zone.expressEligible).toBe(false); // off until the plant confirms
    const on = resolveCoverage({ zip: '75024' }, buildCoverage({ ...LIVE_SETTINGS, expressEnabled: true }));
    expect(on.status === 'served' && on.zone.expressLabel).toBe(EXPRESS_BADGE);
  });

  it('Downtown Dallas -> Zone 2 Dallas Central & Mid-Cities, $60', () => {
    expect(served('75201').zone).toMatchObject({ id: 'zone_2', name: 'Zone 2 — Dallas Central & Mid-Cities', minimumOrder: 60 });
  });

  it('Fort Worth -> Zone 4 Far Metroplex, $100, Tuesday and Friday', () => {
    const r = served('76102');
    expect(r.zone).toMatchObject({ id: 'zone_4', name: 'Zone 4 — Far Metroplex', minimumOrder: 100, routeDays: ['Tuesday', 'Friday'] });
    expect(isZoneRouteDay(r.zone, '2026-10-13', LIVE)).toBe(true); // Tuesday
    expect(isZoneRouteDay(r.zone, '2026-10-14', LIVE)).toBe(false);
  });

  it('every listed city lands in its zone', () => {
    const zoneOf = (zip: string) => served(zip).zone.id;
    // Zone 1: Addison, Carrollton, Farmers Branch, Plano, Frisco, Richardson, The Colony, Lewisville, Flower Mound, Coppell, Preston Hollow, North Dallas, Highland Park
    for (const zip of ['75001', '75007', '75234', '75024', '75034', '75080', '75056', '75057', '75028', '75019', '75230', '75287', '75205']) expect(zoneOf(zip), zip).toBe('zone_1');
    // Zone 2: Uptown, Downtown, Oak Lawn, Design District, Lakewood, Bishop Arts, Las Colinas, Allen, McKinney, Prosper, Grapevine, Southlake, Colleyville, Euless
    for (const zip of ['75204', '75201', '75219', '75207', '75214', '75208', '75039', '75013', '75070', '75078', '76051', '76092', '76034', '76039']) expect(zoneOf(zip), zip).toBe('zone_2');
    // Zone 3: Bedford, Hurst, Keller, Westlake, Grand Prairie, Arlington, Denton, Rockwall, Forney
    for (const zip of ['76021', '76053', '76248', '76262', '75050', '76011', '76201', '75087', '75126']) expect(zoneOf(zip), zip).toBe('zone_3');
    // Zone 4: Downtown Fort Worth, Cultural District, Mansfield
    for (const zip of ['76102', '76107', '76063']) expect(zoneOf(zip), zip).toBe('zone_4');
  });

  it('Zone 3 picks up Monday and Thursday only', () => {
    const zone = served('76201').zone; // Denton
    expect(zone.routeScheduleLabel).toBe('Scheduled Routes (Mon & Thu)');
    expect(['2026-10-12', '2026-10-15'].every((d) => isZoneRouteDay(zone, d, LIVE))).toBe(true);
    expect(['2026-10-13', '2026-10-14', '2026-10-16', '2026-10-17'].some((d) => isZoneRouteDay(zone, d, LIVE))).toBe(false);
  });

  it('an unlisted ZIP is placed by its miles: 22 mi -> Zone 2 (and every band edge)', () => {
    expect(served('75098', 22)).toMatchObject({ zone: { id: 'zone_2' }, byDistance: true });
    expect(served('75999', 0.5).zone.id).toBe('zone_1');
    expect(served('75999', 15).zone.id).toBe('zone_1');
    expect(served('75999', 15.1).zone.id).toBe('zone_2');
    expect(served('75999', 25).zone.id).toBe('zone_2');
    expect(served('75999', 30).zone.id).toBe('zone_3');
    expect(served('75999', 45).zone.id).toBe('zone_4');
    expect(served('75999', 45.1).band?.id).toBe('A');
    expect(served('75999', 60).band?.id).toBe('A');
    expect(served('75999', 60.1).band?.id).toBe('B');
    expect(served('75999', 80).band?.id).toBe('B');
    expect(resolveCoverage({ zip: '75999', miles: 80.1 }, LIVE)).toMatchObject({ status: 'waitlist', reason: 'beyond' });
  });
});

describe('Client validation: Zone 5 Extended Reach', () => {
  it('Waxahachie -> Band A: $35 fee, $125 minimum, Wednesdays, back the next Wednesday', () => {
    const r = served('75165');
    expect(r.band?.id).toBe('A');
    expect(r.zone.minimumOrder).toBe(125);
    expect(extendedReachFeeLine(r.band, false)?.fee).toBe(35);
    expect(extendedReachRunDates('2026-10-07', 3, LIVE.extendedReach)).toEqual(['2026-10-21', '2026-10-28', '2026-11-04']);
    expect(zoneDeliveryDate(r.zone, '2026-10-21', 'standard', {}, LIVE)).toBe('2026-10-28'); // 7 days, never 14
    expect(extendedReachTurnaroundLine(LIVE.extendedReach)).toBe('Extended Reach: picked up Wednesday, back the next Wednesday.');
  });

  it('Sherman -> Band A; a Routine member pays $17.50', () => {
    const r = served('75090');
    expect(r.band?.id).toBe('A');
    expect(extendedReachFeeLine(r.band, true)?.fee).toBe(17.5);
  });

  it('Band B towns: Denison, Weatherford, Corsicana, Gainesville at $60 (Routine $30)', () => {
    for (const zip of ['75020', '76086', '75110', '76240']) {
      const r = served(zip);
      expect(r.band?.id, zip).toBe('B');
      expect(extendedReachFeeLine(r.band, true)?.fee).toBe(30);
    }
  });

  it('before Mission Control sets the first run, Zone 5 addresses join the waitlist ("coming soon")', () => {
    expect(DEFAULT_COVERAGE.extendedReach.firstRunDate).toBeNull();
    expect(resolveCoverage({ zip: '75165' }, DEFAULT_COVERAGE)).toMatchObject({ status: 'waitlist', reason: 'zone5_not_started' });
    expect(extendedReachStartLine(DEFAULT_COVERAGE.extendedReach)).toBe("Extended Reach is coming soon. We'll message you.");
    expect(extendedReachStartLine(LIVE.extendedReach)).toBe("Extended Reach begins Wednesday, October 21. We'll message you.");
    expect(earliestExtendedReachRun('2026-10-07', DEFAULT_COVERAGE.extendedReach)).toBeNull();
  });

  it('bookings close 3 days before a run', () => {
    expect(earliestExtendedReachRun('2026-10-18', LIVE.extendedReach)).toBe('2026-10-21');
    expect(earliestExtendedReachRun('2026-10-19', LIVE.extendedReach)).toBe('2026-10-28');
  });

  it('the fee line is taxed like any line and never discounted', () => {
    const f = calculateOrderFinancials({ subtotal: 125, extendedReachFee: 35 });
    expect(f).toMatchObject({ extendedReachFee: 35, netSubtotal: 160, environmentalFee: 4.8, salesTax: 13.6, finalTotal: 178.4 });
    expect(calculateOrderFinancials({ subtotal: 125, extendedReachFee: 35, discountPercent: 15 }).promoDiscount).toBe(18.75);
  });
});

describe('Route-day delivery and the confirmation', () => {
  it('Zone 4: a Friday pickup is delivered Tuesday; Zone 3: a Thursday pickup Monday', () => {
    expect(zoneDeliveryDate(served('76102').zone, '2026-10-09', 'standard', {}, LIVE)).toBe('2026-10-13');
    expect(zoneDeliveryDate(served('76201').zone, '2026-10-15', 'standard', {}, LIVE)).toBe('2026-10-19');
  });

  it('the confirmation states the delivery day', () => {
    const msg = formatStageMessage({
      orderId: 'o1', orderNumber: 'F11-Z4', customerName: 'Ada', customerPhone: '+12145550100', stage: 'booked',
      pickupDate: '2026-10-09', pickupWindow: 'morning', trackingUrl: 'https://x/track/o1',
      deliveredOn: formatLongDate('2026-10-13'),
    });
    expect(msg.smsBody).toContain('Delivered Tuesday, October 13.');
  });
});

describe('Driving distance and the review log', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    dbWrites.length = 0;
    reportError.mockClear();
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });
  const stubMiles = (miles: number) => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
    vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ routes: [{ distanceMeters: Math.round(miles * 1609.344) }] }), { status: 200 });
    });
    return calls;
  };

  it('an unlisted ZIP at 22 miles is Zone 2 by distance, and logged for review', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const calls = stubMiles(22);
    const r = await resolveAddressCoverage({ street: '1 Main St', city: 'Wylie', zip: '75098' }, LIVE);
    expect(r).toMatchObject({ status: 'served', zone: { id: 'zone_2' }, miles: 22, byDistance: true });
    expect(calls[0].headers['X-Goog-FieldMask']).toBe('routes.distanceMeters');
    expect(calls[0].body).toMatchObject({ origin: { address: '18217 Midway Rd, Dallas, TX 75287' }, travelMode: 'DRIVE' });
    expect(dbWrites).toContainEqual({ table: 'zone_resolution_log', values: expect.objectContaining({ zip: '75098', miles: 22, zone_id: 'zone_2' }) });
  });

  it('a ZIP on the table needs no lookup and is not logged', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect((await resolveAddressCoverage({ zip: '75201' }, LIVE)).status).toBe('served');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dbWrites).toHaveLength(0);
  });

  it('when Google fails, the ZIP code decides and an admin is told', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 403 }));
    expect(await drivingMilesFromHub({ zip: '75165' })).toBeNull();
    expect(reportError).toHaveBeenCalledWith('distance', 'API key not valid', expect.objectContaining({ alert: true }));
    const r = await resolveAddressCoverage({ zip: '75165' }, LIVE);
    expect(r.status === 'served' && r.band?.id).toBe('A');
  });
});

describe('Coverage settings (Mission Control)', () => {
  it('the ZIP table is editable: a ZIP moves zones, a new ZIP joins one, a removed ZIP goes by distance', () => {
    const settings = mergeCoverageSettings({ ...LIVE_SETTINGS, zipZones: { ...LIVE_SETTINGS.zipZones, '75201': 'zone_1', '75098': 'zone_2', '75205': undefined } });
    const coverage = buildCoverage(settings);
    expect(served('75201', undefined, coverage).zone.id).toBe('zone_1');
    expect(served('75098', undefined, coverage).zone.id).toBe('zone_2');
    expect(coverage.zones.zone_1.zipCodes).not.toContain('75205');
    expect(served('75205', 9, coverage)).toMatchObject({ zone: { id: 'zone_1' }, byDistance: true });
  });

  it('a valid edit passes; overlapping bands or a first run on the wrong day are refused; the first run may be blank', () => {
    expect(CoverageSettingsSchema.safeParse(DEFAULT_COVERAGE_SETTINGS).success).toBe(true);
    expect(CoverageSettingsSchema.safeParse(LIVE_SETTINGS).success).toBe(true);
    const overlap = structuredClone(LIVE_SETTINGS);
    overlap.zones.zone_2.minMiles = 10;
    expect(CoverageSettingsSchema.safeParse(overlap).success).toBe(false);
    const wrongDay = structuredClone(LIVE_SETTINGS);
    wrongDay.extendedReach.firstRunDate = '2026-10-22'; // a Thursday
    expect(CoverageSettingsSchema.safeParse(wrongDay).success).toBe(false);
    const badZip = structuredClone(LIVE_SETTINGS);
    badZip.zipZones['7520'] = 'zone_1';
    expect(CoverageSettingsSchema.safeParse(badZip).success).toBe(false);
  });

  it('a saved blank first run stays blank; malformed values keep their defaults', () => {
    expect(mergeCoverageSettings({ extendedReach: { firstRunDate: null } }).extendedReach.firstRunDate).toBeNull();
    const merged = mergeCoverageSettings({ zones: { zone_3: { minimumOrder: 90 } }, extendedReach: { bands: [{ id: 'A', fee: 40 }], cadenceWeeks: 'x' } });
    expect(merged.zones.zone_3.minimumOrder).toBe(90);
    expect(merged.extendedReach.bands[0].fee).toBe(40);
    expect(merged.extendedReach.cadenceWeeks).toBe(1);
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

  it('Waxahachie books the first Wednesday run: $35 fee line, back the next Wednesday', async () => {
    const { status, body } = await book('75165', { pickup_date: '2026-10-21' });
    expect(status).toBe(200);
    expect(body.order).toMatchObject({ extended_reach_fee: 35, zone_id: 'zone_5', delivery_date: '2026-10-28' });
    expect(body.route_threshold).toMatchObject({ booked: 1, threshold: 3 });
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalled());
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ routeThresholdLine: expect.stringContaining('picked up Wednesday, back the next Wednesday') }));
  });

  it('a Routine member in Sherman pays the $17.50 fee', async () => {
    const { body } = await book('75090', { pickup_date: '2026-10-21', frequency: 'weekly' });
    expect(body.order.extended_reach_fee).toBe(17.5);
  });

  it('Zone 5 refuses a day that is not a run, and orders under $125', async () => {
    expect((await book('75165', { pickup_date: '2026-10-22' })).status).toBe(400);
    const small = await book('75165', { pickup_date: '2026-10-21' }, 40); // $120
    expect(small.status).toBe(400);
    expect(small.body.error).toContain('$125.00 minimum');
  });

  it('Denton refuses a Tuesday and books a Monday; Fort Worth on a Friday is delivered Tuesday', async () => {
    expect((await book('76201', { pickup_date: '2026-10-13' })).status).toBe(400);
    expect((await book('76201', { pickup_date: '2026-10-12' })).status).toBe(200);
    const fw = await book('76102', { pickup_date: '2026-10-09' });
    expect(fw.status).toBe(200);
    expect(fw.body.order.delivery_date).toBe('2026-10-13');
  });

  it('an address beyond the routes is sent to the waitlist; Express is refused while switched off', async () => {
    const far = await book('75701', { pickup_date: '2026-10-08' });
    expect(far).toMatchObject({ status: 400, body: { code: 'WAITLIST' } });
    const express = await book('75205', { pickup_date: '2026-10-06', express_tier: 'express_24hr' });
    expect(express.status).toBe(400);
  });
});

describe('Zone 5 runs: the threshold gates new pickups; deliveries always go out', () => {
  type Row = Record<string, unknown>;
  const writes: Array<{ table: string; op: string; values: Row }> = [];
  let pickupsOnRun: Row[] = [];
  let pickups = 0;
  let deliveriesDue = 0;
  let cycle: Row | null = null;
  let alreadyDecided = false;
  const lteDates: unknown[] = [];
  const fake = {
    from: (table: string) => {
      let op = 'select';
      let head = false;
      let values: Row = {};
      const filters: Row = {};
      const record = (o: string, v: Row) => {
        op = o;
        values = v;
        writes.push({ table, op: o, values: v });
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
        lt: () => b,
        lte: (_c: string, v: unknown) => (lteDates.push(v), b),
        gte: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: table === 'route_cycles' ? cycle : table === 'orders' ? (pickupsOnRun[0] ?? null) : null, error: null }),
        then: (resolve: (r: unknown) => unknown) => {
          const r = head
            ? { count: 'delivery_date' in filters ? deliveriesDue : pickups, data: null }
            : op === 'select'
              ? { data: table === 'orders' ? pickupsOnRun : [] }
              : op === 'update'
                ? { data: alreadyDecided && 'decided_at' in values ? [] : [{ id: 'x', run_date: 'x' }] }
                : { data: null };
          return Promise.resolve({ error: null, ...r }).then(resolve);
        },
      };
      return b;
    },
  };
  const order = (id: string) => ({
    id, order_number: `F11-${id}`, pickup_date: '2026-10-28', pickup_window: 'morning', extended_reach_band: 'A',
    customer: { full_name: 'Ada', phone: '+12145550100', email: 'a@example.com' },
    address: { city: 'Sherman' },
  });
  const decideOn = () => rollExtendedReachRuns(fake as never, LIVE, new Date('2026-10-26T14:00:00Z')); // Monday before the run

  beforeEach(() => {
    writes.length = 0;
    cycle = null;
    alreadyDecided = false;
    deliveriesDue = 0;
    dispatch.mockClear();
  });

  it('1 delivery due and 2 new pickups (threshold 3): the run proceeds with all three', async () => {
    pickupsOnRun = [order('1'), order('2')];
    pickups = 2;
    deliveriesDue = 1;
    expect(await decideOn()).toEqual({ dispatched: 1, rolled: 0 });
    expect(writes).toContainEqual(expect.objectContaining({ table: 'route_cycles', op: 'upsert', values: expect.objectContaining({ status: 'dispatched', dispatched_by: 'Delivery run' }) }));
    // Decided Monday evening: the client's "route confirmed" text to each pickup (2026-10-08)
    expect(writes).toContainEqual(expect.objectContaining({ table: 'route_cycles', op: 'update', values: expect.objectContaining({ decided_at: expect.any(String) }) }));
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        customMessage:
          'First Eleven Cleaners: Good news, Ada. Your Sherman pickup is confirmed for Wed Oct 28, 7:30 to 10:00 AM. Have your bag at the door. Return is Wed Nov 4. Questions? Just reply.',
      })
    );
  });

  it('the 9 AM job only catches runs tomorrow; Monday is left to the evening check', async () => {
    pickupsOnRun = [];
    lteDates.length = 0;
    await rollExtendedReachRuns(fake as never, LIVE, new Date('2026-10-26T14:00:00Z'), { daysAhead: 1 });
    expect(lteDates).toEqual(['2026-10-27']);
    lteDates.length = 0;
    await decideOn();
    expect(lteDates).toEqual(['2026-10-28']);
  });

  it('a run already decided is left alone (no second text)', async () => {
    pickupsOnRun = [order('1'), order('2')];
    pickups = 2;
    alreadyDecided = true;
    expect(await decideOn()).toEqual({ dispatched: 0, rolled: 0 });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a booking that leaves the run short gets the "on the list" text with its band\'s threshold', async () => {
    const { sendOnTheList } = await import('@/lib/extended-reach');
    pickupsOnRun = [{ ...order('9'), extended_reach_band: 'B' }];
    await sendOnTheList(fake as never, { orderId: '9', runDate: '2026-10-28', band: 'B', reach: LIVE.extendedReach });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        customMessage:
          "First Eleven Cleaners: You're on the list for Wednesday pickup in Sherman. We confirm routes Monday by 6 PM once your area reaches 4 pickups. No charge until we confirm. Reply STOP to opt out.",
      })
    );
  });

  it('no delivery due and below the threshold: the pickups move to next Wednesday and are told', async () => {
    pickupsOnRun = [order('1'), order('2')];
    pickups = 2;
    expect(await decideOn()).toEqual({ dispatched: 0, rolled: 2 });
    const moves = writes.filter((w) => w.table === 'orders' && w.op === 'update').map((w) => w.values);
    expect(moves).toEqual([
      expect.objectContaining({ pickup_date: '2026-11-04', delivery_date: '2026-11-11' }),
      expect.objectContaining({ pickup_date: '2026-11-04', delivery_date: '2026-11-11' }),
    ]);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        customMessage:
          "First Eleven Cleaners: Hi Ada, Sherman didn't reach 3 pickups this week, so Wed Oct 28 won't run. You stay on the list for Wed Nov 4 at no charge. Reply SKIP to come off the list.",
      })
    );
  });

  it('at the threshold the run is dispatched; "dispatch anyway" runs a short one', async () => {
    pickupsOnRun = [order('1'), order('2'), order('3')];
    pickups = 3;
    expect(await decideOn()).toEqual({ dispatched: 1, rolled: 0 });
    writes.length = 0;
    pickups = 1;
    dispatch.mockClear();
    const forced = await dispatchRunIfReady(fake as never, { runDate: '2026-11-04', band: 'A', reach: LIVE.extendedReach, force: true });
    expect(forced.dispatched).toBe(true);
    // Below the threshold: no "just hit 3 pickups"; Monday evening says "route confirmed"
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a booking that fills the run sends the client\'s "threshold reached" text to everyone on it', async () => {
    pickupsOnRun = [order('1'), order('2'), order('3')];
    pickups = 3;
    const filled = await dispatchRunIfReady(fake as never, { runDate: '2026-10-28', band: 'A', reach: LIVE.extendedReach });
    expect(filled).toMatchObject({ dispatched: true, notified: 3 });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        customMessage: 'First Eleven Cleaners: Sherman just hit 3 pickups. Your Wed Oct 28 pickup is confirmed, 7:30 to 10:00 AM. Bag at the door and we handle the rest.',
      })
    );
  });

  it('the run status line confirms a run with a delivery due', async () => {
    const { runStatusLine } = await import('@/lib/extended-reach');
    expect(runStatusLine({ booked: 1, threshold: 3, deliveriesDue: 1, dispatched: false }, LIVE.extendedReach)).toBe(
      'Your Extended Reach route is confirmed. Extended Reach: picked up Wednesday, back the next Wednesday.'
    );
    expect(runStatusLine({ booked: 2, threshold: 3, deliveriesDue: 0, dispatched: false }, LIVE.extendedReach)).toContain(dispatchThresholdMessage(2, 3));
  });
});

describe('Pages, Eleven and the coverage copy', () => {
  const src = (rel: string) => readFileSync(join(__dirname, '..', 'src', ...rel.split('/')), 'utf8');

  it('the coverage page uses the zone settings, the new Zone 5 title and the client copy', () => {
    const page = src('app/service-areas/page.tsx');
    expect(page).toContain('Door-to-door courier delivery is complimentary across the entire DFW Metroplex.');
    expect(page).toContain('coverage.zonesList.map');
    expect(page).toContain('Zone 5 — {reachZone.routeScheduleLabel}');
    expect(page).toContain('See Extended Reach.');
    expect(LIVE.extendedReachZone.routeScheduleLabel).toBe('Extended Reach — weekly Wednesdays');
    expect(LIVE.zonesList.map((z) => z.name)).toEqual([
      'Zone 1 — North Core',
      'Zone 2 — Dallas Central & Mid-Cities',
      'Zone 3 — Outer Ring',
      'Zone 4 — Far Metroplex',
    ]);
  });

  it('Eleven knows the five zones, the bands, the weekly Zone 5 rules and route-day delivery', () => {
    const prompt = buildElevenSystemPrompt(LIVE);
    expect(prompt).toContain('Zone 1 — North Core (about 0-15 mi from the plant): $45.00 order minimum');
    expect(prompt).toContain('45-60 mi $35 (Burleson, Waxahachie, Greenville, Sherman; new pickups open at 3 bookings)');
    expect(prompt).toContain('60-80 mi $60 (Denison, Weatherford, Corsicana, Gainesville; new pickups open at 4 bookings)');
    expect(prompt).toContain('Extended Reach: picked up Wednesday, back the next Wednesday.');
    expect(prompt).toContain('A run always goes out when deliveries are due');
    expect(prompt).toContain('0-15 mi Zone 1, 15-25 Zone 2, 25-35 Zone 3, 35-45 Zone 4, 45-80 Zone 5');
    expect(prompt).toContain('a Zone 4 Friday pickup is delivered Tuesday');
    expect(prompt).not.toContain('18217 Midway');
    expect(buildElevenSystemPrompt(DEFAULT_COVERAGE)).toContain("Extended Reach is coming soon. We'll message you.");
    expect(coverageAnswer(LIVE)).toContain('back the next Wednesday');
  });

  it('the old Zone 4 extras (Weatherford, Waxahachie, Burleson) are Zone 5 now', () => {
    expect(resolveZoneByZip('76086')?.id).toBe('zone_5');
    expect(resolveZoneByZip('75165')?.id).toBe('zone_5');
    expect(resolveZoneByZip('76028')?.id).toBe('zone_5');
  });
});
