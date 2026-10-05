import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeRpc } from './helpers/fake-create-booking';

type Row = Record<string, unknown>;
const { state } = vi.hoisted(() => ({
  state: {
    promoRow: null as Row | null,
    priorPromoUses: 0,
    reserveResult: true as boolean,
    rpcCalls: [] as { fn: string; args: Row }[],
    writes: [] as { table: string; op: string; values: Row }[],
  },
}));

function builder(table: string) {
  let op = 'select';
  let values: Row = {};
  let isCount = false;
  const result = () => {
    if (isCount) return { count: table === 'orders' ? state.priorPromoUses : 0, error: null };
    if (op === 'insert') return { data: { id: `${table}-new-id`, ...values }, error: null };
    if (op === 'update') return { data: null, error: null };
    if (table === 'promo_codes') return { data: state.promoRow, error: null };
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

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => builder(t),
    rpc: (fn: string, args: Row) => {
      state.rpcCalls.push({ fn, args });
      return fakeRpc(builder, { reservePromo: () => state.reserveResult })(fn, args);
    },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: vi.fn(async () => ({})) } }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));

import { POST } from '@/app/api/bookings/route';
import { calculateOrderFinancials } from '@/lib/constants';

function booking(promo: string) {
  const todayTx = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  const d = new Date(`${todayTx}T12:00:00`);
  d.setDate(d.getDate() + 2); // first Monday at least 2 days ahead (standard minimum, PR-12)
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  return new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: { full_name: 'Promo Tester', email: 'promo.tester@example.com', phone: '2145550100' },
      address: { street: '100 Test St', city: 'Dallas', state: 'TX', zip: '75201' },
      services: { type: 'wash_fold', dry_clean_items: [], estimated_weight_lbs: 20 },
      schedule: { pickup_date: d.toISOString().split('T')[0], pickup_window: 'morning', express_tier: 'standard' },
      pricing: { promo_code: promo },
    }),
  });
}

const originalEnv = { ...process.env };

describe('Promo codes: fixed amounts, one use per customer, atomic caps (SEC-15)', () => {
  beforeEach(() => {
    state.promoRow = null;
    state.priorPromoUses = 0;
    state.reserveResult = true;
    state.rpcCalls = [];
    state.writes = [];
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
    delete process.env.SQUARE_ACCESS_TOKEN;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('applies a fixed code as a dollar discount, not a percentage', async () => {
    state.promoRow = { discount_type: 'fixed', discount_value: 5, max_uses: 2000, current_uses: 0, valid_from: null, valid_until: null };
    const res = await POST(booking('WELCOME5'));
    const body = await res.json();
    const expected = calculateOrderFinancials({ subtotal: 60, discountAmount: 5 });
    expect(res.status).toBe(200);
    expect(body.order.total).toBe(expected.finalTotal);
    const order = state.writes.find((w) => w.table === 'orders')?.values;
    expect(order).toMatchObject({ promo_code: 'WELCOME5', discount_amount: 5 });
  });

  it('reserves a use in the same transaction that creates the order (PR-10)', async () => {
    state.promoRow = { discount_type: 'percentage', discount_value: 10, max_uses: 5000, current_uses: 10, valid_from: null, valid_until: null };
    await POST(booking('MATCHREADY'));
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].fn).toBe('create_booking');
    const p = state.rpcCalls[0].args.p as Row;
    expect(p.reserve_promo).toBe(true);
    expect((p.order as Row).promo_code).toBe('MATCHREADY');
    expect(state.writes.some((w) => w.table === 'promo_codes')).toBe(false);
  });

  it('refuses the booking when no use can be reserved, without creating an order', async () => {
    state.promoRow = { discount_type: 'percentage', discount_value: 10, max_uses: 1, current_uses: 0, valid_from: null, valid_until: null };
    state.reserveResult = false;
    const res = await POST(booking('MATCHREADY'));
    expect(res.status).toBe(409);
    expect(state.writes.some((w) => w.table === 'orders')).toBe(false);
  });

  it('refuses a code this customer has already used', async () => {
    state.promoRow = { discount_type: 'percentage', discount_value: 15, max_uses: 10000, current_uses: 3, valid_from: null, valid_until: null };
    state.priorPromoUses = 1;
    const res = await POST(booking('KICKOFF15'));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('already been used');
    expect(state.rpcCalls).toHaveLength(0);
  });
});
