import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeRpc } from './helpers/fake-create-booking';

// ---------------------------------------------------------------------------
// Fake Supabase client with per-table failure injection
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const inserts: { table: string; values: Row }[] = [];
let failInsertOn: string | null = null;
let throwOnTable: string | null = null;

function builder(table: string) {
  if (throwOnTable === table) throw new Error(`connection lost while reading ${table}`);
  let op: 'select' | 'insert' | 'update' = 'select';
  let values: Row = {};
  let isCount = false;
  const result = () => {
    if (isCount) return { count: 0, error: null };
    if (op === 'insert') {
      if (failInsertOn === table) return { data: null, error: { code: '23514', message: `insert into ${table} rejected` } };
      return { data: { id: `${table}-new-id`, ...values }, error: null };
    }
    if (op === 'update') return { data: null, error: null };
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {
    select: (_cols?: string, opts?: { head?: boolean }) => {
      if (opts?.head) isCount = true;
      return b;
    },
    insert: (v: Row) => {
      op = 'insert';
      values = v;
      inserts.push({ table, values: v });
      return b;
    },
    update: () => {
      op = 'update';
      return b;
    },
    eq: () => b,
    neq: () => b,
    ilike: () => b,
    maybeSingle: async () => result(),
    single: async () => result(),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return b;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table), rpc: fakeRpc(builder) }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
const { dispatchStageNotification } = vi.hoisted(() => ({
  dispatchStageNotification: vi.fn(async () => ({ success: true })),
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
  d.setDate(d.getDate() + 2); // first Monday at least 2 days ahead (standard minimum, PR-12)
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  return d.toISOString().split('T')[0];
}

function bookingRequest() {
  return new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: { full_name: 'Persist Tester', email: 'persist.tester@example.com', phone: '2145550100' },
      address: { street: '100 Test St', city: 'Dallas', state: 'TX', zip: '75201' },
      services: { type: 'wash_fold', dry_clean_items: [], estimated_weight_lbs: 15 },
      schedule: { pickup_date: nextMonday(), pickup_window: 'morning', express_tier: 'standard', frequency: 'one_time' },
      consents: { sms_order_updates: false, sms_promotions: false },
    }),
  });
}

const originalEnv = { ...process.env };

describe('Booking never reports success when the order was not saved (SEC-12)', () => {
  beforeEach(() => {
    inserts.length = 0;
    failInsertOn = null;
    throwOnTable = null;
    dispatchStageNotification.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
    delete process.env.SQUARE_ACCESS_TOKEN; // local dev without Square: card on file not required
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns 503 and sends no confirmation when the order insert is rejected', async () => {
    failInsertOn = 'orders';
    const res = await POST(bookingRequest());
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.success).toBeUndefined();
    expect(body.error).toContain("couldn't save your booking");
    expect(dispatchStageNotification).not.toHaveBeenCalled();
  });

  it('returns 503 when the customer record cannot be created', async () => {
    failInsertOn = 'customers';
    const res = await POST(bookingRequest());
    expect(res.status).toBe(503);
    expect(inserts.some((i) => i.table === 'orders')).toBe(false);
    expect(dispatchStageNotification).not.toHaveBeenCalled();
  });

  it('returns 503 when the database throws', async () => {
    throwOnTable = 'customers';
    const res = await POST(bookingRequest());
    expect(res.status).toBe(503);
    expect(dispatchStageNotification).not.toHaveBeenCalled();
  });

  it('still confirms and notifies when the order is saved', async () => {
    const res = await POST(bookingRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.order.id).toBe('orders-new-id');
    expect(dispatchStageNotification).toHaveBeenCalledTimes(1);
  });
});
