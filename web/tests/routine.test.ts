import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fakeRpc } from './helpers/fake-create-booking';

// ---------------------------------------------------------------------------
// Client 2026-10-07 (revised) and 2026-10-08: the Routine is a standing
// subscription. Choosing Weekly or Bi-Weekly at checkout joins it (with the
// auto-renewal agreement); status lasts until cancelled (no fee); skip never
// cancels; 3 skips in a row pause it; pause up to 8 weeks; a membership needs
// an account, made silently.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const { state, dispatchStageNotification, createUser } = vi.hoisted(() => ({
  state: {
    writes: [] as { table: string; op: string; values: Row; filters: Row }[],
    openMembership: null as Row | null,
    customer: null as Row | null,
    routineOrders: [] as Row[],
  },
  dispatchStageNotification: vi.fn(async () => ({ success: true })),
  createUser: vi.fn(async () => ({ data: {}, error: null })),
}));

function builder(table: string) {
  let op = 'select';
  let values: Row = {};
  let isCount = false;
  const filters: Row = {};
  const result = () => {
    if (isCount) return { count: 0, error: null };
    if (op === 'insert') return { data: { id: `${table}-new-id`, ...values }, error: null };
    if (op === 'update') return { data: table === 'orders' ? [{ id: filters.id }] : [], error: null };
    if (table === 'routine_memberships') return { data: state.openMembership, error: null };
    if (table === 'customers') return { data: state.customer, error: null };
    if (table === 'orders' && filters.routine_membership_id) return { data: state.routineOrders, error: null };
    return { data: null, error: null };
  };
  const record = (o: string, v: Row) => {
    op = o;
    values = v;
    state.writes.push({ table, op: o, values: v, filters });
  };
  const b: Record<string, unknown> = {
    select: (_c?: string, opts?: { head?: boolean }) => ((isCount = Boolean(opts?.head) || isCount), b),
    insert: (v: Row) => (record('insert', v), b),
    update: (v: Row) => (record('update', v), b),
    eq: (c: string, v: unknown) => ((filters[c] = v), b),
    neq: () => b,
    gte: () => b,
    ilike: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: async () => {
      const r = result();
      return Array.isArray(r.data) ? { ...r, data: r.data[0] ?? null } : r;
    },
    single: async () => result(),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return b;
}

const rpc = fakeRpc(builder);
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t), rpc: (fn: string, args: Row) => rpc(fn, args), auth: { admin: { createUser } } }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification } }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));
const releaseOrderHold = vi.fn(async () => undefined);
vi.mock('@/lib/payment-capture', async (orig) => ({ ...(await orig<typeof import('@/lib/payment-capture')>()), releaseOrderHold: (...a: unknown[]) => releaseOrderHold(...(a as [])) }));

import { POST } from '@/app/api/bookings/route';
import { DEFAULT_COVERAGE_SETTINGS, buildCoverage } from '@/lib/coverage';
import { decideRoutineChange, routineAgreementText, type RoutineMembership } from '@/lib/routine';
import { applyRoutineChange } from '@/lib/routine-store';
import { formatStageMessage } from '@/lib/messaging/templates';

const LIVE = buildCoverage({ ...DEFAULT_COVERAGE_SETTINGS, extendedReach: { ...DEFAULT_COVERAGE_SETTINGS.extendedReach, firstRunDate: '2026-10-21' } });
const NOW = new Date('2026-10-08T15:00:00Z'); // Thursday, October 8 (Dallas)

function nextMonday(): string {
  const todayTx = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  const d = new Date(`${todayTx}T12:00:00`);
  d.setDate(d.getDate() + 2);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  return d.toISOString().split('T')[0];
}
const plusDays = (date: string, n: number) => new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

function bookingRequest(schedule: Row, consents: Row = {}) {
  return new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: { full_name: 'Rita Routine', email: 'rita@example.com', phone: '2145550100' },
      address: { street: '100 Test St', city: 'Dallas', state: 'TX', zip: '75205' },
      services: { type: 'mixed', dry_clean_items: [{ garment_type: 'dress_shirt', quantity: 4 }], estimated_weight_lbs: 15 },
      schedule: { pickup_date: nextMonday(), pickup_window: 'morning', express_tier: 'standard', ...schedule },
      consents: { payment_terms: true, ...consents },
    }),
  });
}

const originalEnv = { ...process.env };
beforeEach(() => {
  state.writes = [];
  state.openMembership = null;
  state.customer = { id: 'cust-1', email: 'rita@example.com', full_name: 'Rita Routine', role: 'customer', auth_id: null, phone: '+12145550100' };
  state.routineOrders = [];
  dispatchStageNotification.mockClear();
  createUser.mockClear();
  releaseOrderHold.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
  delete process.env.SQUARE_ACCESS_TOKEN;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('Joining the Routine at checkout', () => {
  it('Weekly Routine needs the auto-renewal agreement', async () => {
    const res = await POST(bookingRequest({ frequency: 'weekly' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Please accept the Routine membership terms to join.');
  });

  it('creates the membership from the booking, links the order and makes the account silently', async () => {
    const pickup = nextMonday();
    const res = await POST(bookingRequest({ frequency: 'weekly' }, { routine_terms: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.routine).toEqual({ cadence: 'weekly', next_pickup_date: plusDays(pickup, 7) });

    const membership = state.writes.find((w) => w.table === 'routine_memberships' && w.op === 'insert')?.values;
    expect(membership).toMatchObject({
      customer_id: 'cust-1',
      status: 'active',
      cadence: 'weekly',
      pickup_day: 'Monday',
      pickup_window: 'morning',
      next_pickup_date: plusDays(pickup, 7),
      terms_version: '2026-10-08',
      template: { zone_id: 'zone_1', extended_reach_band: null, order_type: 'mixed', services: expect.objectContaining({ estimated_weight_lbs: 15 }) },
    });
    expect(membership?.template).not.toHaveProperty('services.alteration_items');
    expect(state.writes).toContainEqual(expect.objectContaining({ table: 'orders', op: 'update', values: { routine_membership_id: 'routine_memberships-new-id' } }));
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'rita@example.com', email_confirm: true }));
    // The confirmation says so
    expect(dispatchStageNotification).toHaveBeenCalledWith(expect.objectContaining({ routineLine: expect.stringContaining("You're in the Weekly Routine: next pickup") }));
  });

  it('a one-time booking is not a membership', async () => {
    await POST(bookingRequest({ frequency: 'one_time' }));
    expect(state.writes.some((w) => w.table === 'routine_memberships')).toBe(false);
  });

  it('one membership at a time', async () => {
    state.openMembership = { id: 'm-1', status: 'active' };
    const res = await POST(bookingRequest({ frequency: 'biweekly' }, { routine_terms: true }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ALREADY_MEMBER');
  });

  it('the confirmation text carries the Routine line', () => {
    const msg = formatStageMessage({
      orderId: 'o', orderNumber: 'F11-1', customerName: 'Rita', customerPhone: '', stage: 'booked', trackingUrl: 'https://x/track/o',
      routineLine: "You're in the Weekly Routine: next pickup Monday, October 19.",
    });
    expect(msg.smsBody).toContain("You're in the Weekly Routine: next pickup Monday, October 19.");
  });

  it('the agreement states the renewal, holds, skipping, pausing and free cancellation', () => {
    const text = routineAgreementText({ cadence: 'biweekly', day: 'Tuesday', window: 'evening' });
    expect(text).toContain('every 2 weeks on Tuesday, 5:00 to 8:00 PM');
    expect(text).toContain('until you cancel');
    expect(text).toContain('pause for up to 8 weeks');
    expect(text).toContain('Cancel anytime, no fee.');
    const terms = readFileSync(join(__dirname, '..', 'src', 'app', 'terms', 'page.tsx'), 'utf8');
    expect(terms).toContain('Routine Membership (Automatic Renewal)');
  });
});

const member = (over: Partial<RoutineMembership> = {}): RoutineMembership => ({
  id: 'm-1',
  customer_id: 'cust-1',
  status: 'active',
  cadence: 'weekly',
  pickup_day: 'Monday',
  pickup_window: 'morning',
  address_id: 'a-1',
  next_pickup_date: '2026-10-12',
  paused_until: null,
  consecutive_skips: 0,
  template: { zone_id: 'zone_1', extended_reach_band: null, order_type: 'mixed', services: {} },
  created_at: '2026-10-01T00:00:00Z',
  ...over,
});
const decide = (m: RoutineMembership, change: Parameters<typeof decideRoutineChange>[1], zone = LIVE.zones.zone_1) => decideRoutineChange(m, change, zone, LIVE, NOW);

describe('Managing the Routine', () => {
  it('skip moves the next pickup a week (Bi-Weekly: two) and never cancels', () => {
    expect(decide(member(), { action: 'skip' })).toEqual({ ok: true, skippedDate: '2026-10-12', patch: { consecutive_skips: 1, next_pickup_date: '2026-10-19' } });
    expect(decide(member({ cadence: 'biweekly' }), { action: 'skip' })).toMatchObject({ patch: { next_pickup_date: '2026-10-26' } });
  });

  it('3 skips in a row pause the membership (status kept)', () => {
    expect(decide(member({ consecutive_skips: 2 }), { action: 'skip' })).toEqual({
      ok: true,
      autoPaused: true,
      skippedDate: '2026-10-12',
      patch: { consecutive_skips: 3, status: 'paused', paused_until: '2026-12-03', next_pickup_date: null },
    });
  });

  it('pause is 1 to 8 weeks', () => {
    expect(decide(member(), { action: 'pause', weeks: 2 })).toMatchObject({ ok: true, patch: { status: 'paused', paused_until: '2026-10-22' } });
    expect(decide(member(), { action: 'pause', weeks: 9 })).toMatchObject({ ok: false });
    expect(decide(member(), { action: 'pause', weeks: 0 })).toMatchObject({ ok: false });
  });

  it('resume picks the next pickup day at least 3 days ahead, and clears the skips', () => {
    expect(decide(member({ status: 'paused', next_pickup_date: null, consecutive_skips: 3 }), { action: 'resume' })).toEqual({
      ok: true,
      patch: { status: 'active', paused_until: null, consecutive_skips: 0, next_pickup_date: '2026-10-12' },
    });
  });

  it('Zone 4 members can only choose its route days; Zone 5 only Wednesdays', () => {
    const z4 = member({ pickup_day: 'Tuesday', template: { zone_id: 'zone_4', extended_reach_band: null, order_type: 'mixed', services: {} } });
    expect(decide(z4, { action: 'update', pickup_day: 'Monday' }, LIVE.zones.zone_4)).toEqual({ ok: false, error: 'Pickups in your area run on Tuesday and Friday.' });
    expect(decide(z4, { action: 'update', pickup_day: 'Friday' }, LIVE.zones.zone_4)).toMatchObject({ ok: true, patch: { pickup_day: 'Friday', next_pickup_date: '2026-10-16' } });
    expect(decide(member({ pickup_day: 'Wednesday' }), { action: 'update', pickup_day: 'Thursday' }, LIVE.extendedReachZone)).toMatchObject({ ok: false });
  });

  it('cancel is free and final', () => {
    const cancelled = decide(member(), { action: 'cancel', reason: 'moving' });
    expect(cancelled).toMatchObject({ ok: true, patch: { status: 'cancelled', next_pickup_date: null, cancel_reason: 'moving' } });
    expect(decide(member({ status: 'cancelled' }), { action: 'skip' })).toMatchObject({ ok: false });
  });

  it('skipping when the pickup is already made cancels it and releases its hold (the schedule carries on)', async () => {
    state.routineOrders = [{ id: 'auto-1', order_number: 'F11-AUTO', pickup_date: '2026-10-12', hold_payment_id: 'HOLD', hold_status: 'held' }];
    const supabase = (await import('@/lib/supabase/admin')).createAdminClient();
    const result = await applyRoutineChange(supabase, { ...member({ next_pickup_date: '2026-10-19' }), enrolled_order_id: 'first' }, { action: 'skip' }, LIVE, NOW);
    expect(result).toMatchObject({ ok: true, skippedDate: '2026-10-12', patch: { consecutive_skips: 1 } });
    expect(state.writes).toContainEqual(expect.objectContaining({ table: 'routine_memberships', op: 'update', values: expect.not.objectContaining({ next_pickup_date: expect.anything() }) }));
    expect(state.writes).toContainEqual(expect.objectContaining({ table: 'orders', op: 'update', values: expect.objectContaining({ status: 'cancelled' }), filters: expect.objectContaining({ id: 'auto-1' }) }));
    expect(releaseOrderHold).toHaveBeenCalledWith(supabase, state.routineOrders[0], 'Routine pickup skipped');
  });
});
