import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fakeRpc } from './helpers/fake-create-booking';

// ---------------------------------------------------------------------------
// PR-10 / PR-11: a booking is saved in one transaction (create_booking), and a
// repeated submit of the same checkout returns the first order.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const { state, dispatchStageNotification } = vi.hoisted(() => ({
  state: {
    writes: [] as { table: string; values: Row }[],
    rpcCalls: [] as { fn: string; args: Row }[],
    failInsertOn: null as string | null,
    existingByKey: null as Row | null,
    refusal: null as string | null,
    replayFromRpc: false,
  },
  dispatchStageNotification: vi.fn(async () => ({ success: true })),
}));

function builder(table: string) {
  let op = 'select';
  let values: Row = {};
  let isCount = false;
  let byKey = false;
  const result = () => {
    if (isCount) return { count: 0, error: null };
    if (op === 'insert') {
      if (state.failInsertOn === table) return { data: null, error: { code: '23514', message: `insert into ${table} rejected` } };
      return { data: { id: `${table}-new-id`, ...values }, error: null };
    }
    if (table === 'orders' && byKey) return { data: state.existingByKey, error: null };
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {
    select: (_c?: string, opts?: { head?: boolean }) => {
      if (opts?.head) isCount = true;
      return b;
    },
    insert: (v: Row) => {
      op = 'insert';
      values = v;
      state.writes.push({ table, values: v });
      return b;
    },
    update: () => {
      op = 'update';
      return b;
    },
    eq: (col: string) => {
      if (col === 'idempotency_key') byKey = true;
      return b;
    },
    neq: () => b,
    ilike: () => b,
    maybeSingle: async () => result(),
    single: async () => result(),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return b;
}

const rpc = fakeRpc(builder, { refuse: () => state.refusal });
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => builder(t),
    rpc: async (fn: string, args: Row) => {
      state.rpcCalls.push({ fn, args });
      if (state.replayFromRpc) {
        return { data: { ok: true, replay: true, order: { id: 'first-order', order_number: 'F11-2026-FIRST', total: 70, status: 'booked' } }, error: null };
      }
      return rpc(fn, args);
    },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification } }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));

import { POST } from '@/app/api/bookings/route';

function nextMonday(): string {
  const todayTx = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  const d = new Date(`${todayTx}T12:00:00`);
  d.setDate(d.getDate() + 2);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  return d.toISOString().split('T')[0];
}

const KEY = '7d3f9a52-1c4e-4b8a-9f00-2a6b5c7d8e91';

function bookingRequest(extra: Row = {}) {
  return new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: { full_name: 'Atomic Tester', email: 'atomic.tester@example.com', phone: '2145550100' },
      address: { street: '100 Test St', city: 'Dallas', state: 'TX', zip: '75201' },
      services: { type: 'mixed', dry_clean_items: [{ garment_type: 'dress_shirt', quantity: 4 }], estimated_weight_lbs: 15 },
      schedule: { pickup_date: nextMonday(), pickup_window: 'morning', express_tier: 'standard', frequency: 'one_time' },
      consents: { sms_order_updates: false, sms_promotions: false, payment_terms: true },
      ...extra,
    }),
  });
}

const originalEnv = { ...process.env };

beforeEach(() => {
  state.writes = [];
  state.rpcCalls = [];
  state.failInsertOn = null;
  state.existingByKey = null;
  state.refusal = null;
  state.replayFromRpc = false;
  dispatchStageNotification.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
  delete process.env.SQUARE_ACCESS_TOKEN;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('A booking is all-or-nothing (PR-10)', () => {
  it('creates the order, items and event through one create_booking call', async () => {
    const res = await POST(bookingRequest({ idempotency_key: KEY }));
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toHaveLength(1);
    const p = state.rpcCalls[0].args.p as Row;
    expect(p).toMatchObject({ idempotency_key: KEY, window_capacity: 25, reserve_promo: false });
    expect((p.items as Row[]).length).toBeGreaterThan(0);
    expect((p.event as Row).triggered_by).toBe('Customer (Web Booking)');
  });

  it('fails the whole booking, with no confirmation, when the items cannot be saved', async () => {
    // Before: the order was kept without its items and the customer was told it was confirmed
    state.failInsertOn = 'order_items';
    const res = await POST(bookingRequest());
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.success).toBeUndefined();
    expect(dispatchStageNotification).not.toHaveBeenCalled();
  });

  it.each([
    ['window_full', 400, 'reached full capacity'],
    ['express_full', 400, 'daily limit'],
    ['promo_used', 400, 'already been used'],
    ['promo_exhausted', 409, 'usage limit'],
  ])('turns a %s refusal under the lock into a clear message', async (reason, status, text) => {
    state.refusal = reason;
    const res = await POST(bookingRequest());
    const body = await res.json();
    expect(res.status).toBe(status);
    expect(body.error).toContain(text);
    expect(state.writes.some((w) => w.table === 'orders')).toBe(false);
    expect(dispatchStageNotification).not.toHaveBeenCalled();
  });
});

describe('A repeated checkout returns the first order (PR-11)', () => {
  it('returns the existing order for a known key without booking or notifying again', async () => {
    state.existingByKey = { id: 'first-order', order_number: 'F11-2026-FIRST', total: 70, status: 'booked' };
    const res = await POST(bookingRequest({ idempotency_key: KEY }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, replay: true, order_number: 'F11-2026-FIRST' });
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.writes).toHaveLength(0);
    expect(dispatchStageNotification).not.toHaveBeenCalled();
  });

  it('does not notify twice when a simultaneous submit wins inside the database', async () => {
    state.replayFromRpc = true;
    const res = await POST(bookingRequest({ idempotency_key: KEY }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.order.id).toBe('first-order');
    expect(dispatchStageNotification).not.toHaveBeenCalled();
  });

  it('rejects a key that is not a UUID', async () => {
    const res = await POST(bookingRequest({ idempotency_key: 'not-a-uuid' }));
    expect(res.status).toBe(400);
  });

  it('the booking form sends one key per checkout and starts a new one after success', () => {
    const hook = readFileSync('src/hooks/useBookingState.ts', 'utf8');
    expect(hook).toContain('idempotency_key: checkoutKeyRef.current');
    expect(hook).toContain('checkoutKeyRef.current = crypto.randomUUID()');
    expect(hook).toContain('checkoutKeyRef.current = null');
  });
});
