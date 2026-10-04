import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Row = Record<string, unknown>;
const { state } = vi.hoisted(() => ({
  state: {
    existingCustomer: null as Row | null,
    writes: [] as { table: string; op: string; values: Row }[],
  },
}));

function builder(table: string) {
  let op = 'select';
  let values: Row = {};
  let isCount = false;
  const result = () => {
    if (isCount) return { count: 0, error: null };
    if (op === 'insert') return { data: { id: `${table}-new-id`, ...values }, error: null };
    if (op === 'update') return { data: null, error: null };
    return { data: table === 'customers' ? state.existingCustomer : null, error: null };
  };
  const b: Record<string, unknown> = {
    select: (_c?: string, opts?: { head?: boolean }) => {
      if (opts?.head) isCount = true;
      return b;
    },
    insert: (v: Row) => {
      op = 'insert';
      values = v;
      state.writes.push({ table, op, values: v });
      return b;
    },
    update: (v: Row) => {
      op = 'update';
      values = v;
      state.writes.push({ table, op, values: v });
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

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: vi.fn(async () => ({})) } }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));

import { POST } from '@/app/api/bookings/route';

function booking(consent: boolean) {
  const todayTx = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  const d = new Date(`${todayTx}T12:00:00`);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: { full_name: 'Someone Else', email: 'victim@example.com', phone: '2145550100' },
      address: { street: '1 Attacker Way', city: 'Dallas', state: 'TX', zip: '75201' },
      services: { type: 'wash_fold', dry_clean_items: [], estimated_weight_lbs: 15 },
      schedule: { pickup_date: d.toISOString().split('T')[0], pickup_window: 'morning', express_tier: 'standard' },
      consents: { sms_order_updates: consent, sms_promotions: consent },
    }),
  });
}

const originalEnv = { ...process.env };

describe('Booking with an existing customer email (SEC-11)', () => {
  beforeEach(() => {
    state.writes = [];
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
    delete process.env.SQUARE_ACCESS_TOKEN;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("asks a visitor to log in when the email belongs to a registered account, and touches nothing", async () => {
    state.existingCustomer = { id: 'cust-registered', auth_id: 'auth-123' };
    const res = await POST(booking(true));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe('ACCOUNT_EXISTS');
    expect(state.writes).toHaveLength(0);
  });

  it("books for a returning guest without changing the guest's saved SMS consent", async () => {
    state.existingCustomer = { id: 'cust-guest', auth_id: null };
    const res = await POST(booking(true));
    expect(res.status).toBe(200);
    expect(state.writes.some((w) => w.table === 'customers' && w.op === 'update')).toBe(false);
    expect(state.writes.find((w) => w.table === 'orders')?.values).toMatchObject({ customer_id: 'cust-guest' });
  });
});
