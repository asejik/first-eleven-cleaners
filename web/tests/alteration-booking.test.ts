import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeRpc } from './helpers/fake-create-booking';
import { estimatedDeliveryDate } from '@/lib/schedule';

// ---------------------------------------------------------------------------
// Client 2026-10-06, Parts B-D: booking alterations. Each piece carries its fit
// instruction to the database; buttons alone are refused; Express and
// alterations can't share an order; the whole order returns together on the
// alteration date (5th plant day), and the confirmation says so.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const { state, dispatch } = vi.hoisted(() => ({
  state: { writes: [] as { table: string; values: Row }[], rpcCalls: [] as Row[] },
  dispatch: vi.fn(async () => ({ success: true })),
}));

function builder(table: string) {
  let op = 'select';
  let values: Row = {};
  let isCount = false;
  const result = () => {
    if (isCount) return { count: 0, error: null };
    if (op === 'insert') return { data: { id: `${table}-new-id`, ...values }, error: null };
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
    update: () => ((op = 'update'), b),
    eq: () => b,
    neq: () => b,
    ilike: () => b,
    maybeSingle: async () => result(),
    single: async () => result(),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return b;
}
const rpc = fakeRpc(builder);
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => builder(t),
    rpc: async (fn: string, args: Row) => {
      state.rpcCalls.push(args);
      return rpc(fn, args);
    },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: dispatch } }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));

import { POST } from '@/app/api/bookings/route';

// Wednesday 2026-10-07, noon Dallas; pickup Monday 2026-10-12 (no hold now, no Square)
const PICKUP = '2026-10-12';
const hem = (instruction: Row = { type: 'measurement', value: 31, unit: 'in' }) => ({ garment_type: 'hem_plain', quantity: 1, instruction });

function booking(services: Row, schedule: Row = {}) {
  return POST(
    new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { full_name: 'Alter Tester', email: 'alter.tester@example.com', phone: '2145550100' },
        address: { street: '100 Test St', city: 'Dallas', state: 'TX', zip: '75205' },
        services: { type: 'dry_clean', dry_clean_items: [], estimated_weight_lbs: 0, ...services },
        schedule: { pickup_date: PICKUP, pickup_window: 'morning', express_tier: 'standard', frequency: 'one_time', ...schedule },
        consents: { sms_order_updates: false, sms_promotions: false, payment_terms: true },
      }),
    })
  );
}

const originalEnv = { ...process.env };
beforeEach(() => {
  state.writes = [];
  state.rpcCalls = [];
  dispatch.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T12:00:00-05:00'));
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
  delete process.env.SQUARE_ACCESS_TOKEN;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Booking alterations', () => {
  it('validation example: 2 plain hems + 1 zipper = $95.97, each with its instruction, returning together', async () => {
    const res = await booking({
      alteration_items: [
        hem(),
        hem({ type: 'match' }),
        { garment_type: 'zipper', quantity: 1, instruction: { type: 'description', text: 'Front fly, black, 7 inch' } },
      ],
    });
    expect(res.status).toBe(200);
    const p = state.rpcCalls[0].p as { order: Row; items: Row[] };
    expect(p.order.subtotal).toBe(95.97);
    expect(p.items).toHaveLength(3);
    expect(p.items[0]).toMatchObject({
      service_type: 'alteration',
      garment_type: 'hem_plain',
      unit_price: 29.99,
      details: { instruction: { type: 'measurement', value: 31, unit: 'in' } },
      quote_status: 'none',
      notes: 'Measurement: finished length 31 in',
    });
    expect(p.items[1].notes).toContain('tagged MATCH');
    // 3-5 business days: the whole order returns on the 5th plant day
    expect(p.order.delivery_date).toBe(estimatedDeliveryDate(PICKUP, 'standard', { alterations: true }));
    expect(p.order.delivery_date).toBe('2026-10-19');
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ returnsTogetherOn: '2026-10-19' }));
  });

  it('marks "from" items pending: the price is confirmed at intake', async () => {
    const res = await booking({ alteration_items: [{ garment_type: 'sleeve', quantity: 1, instruction: { type: 'pinned' } }], dry_clean_items: [{ garment_type: 'jacket', quantity: 1 }] });
    expect(res.status).toBe(200);
    const items = (state.rpcCalls[0].p as { items: Row[] }).items;
    expect(items.find((i) => i.garment_type === 'sleeve')).toMatchObject({ quote_status: 'pending', unit_price: 49.99 });
  });

  it('validation example: 1 button alone is refused with a message to add a cleaning item', async () => {
    const res = await booking({ alteration_items: [{ garment_type: 'button', quantity: 1, instruction: { type: 'description', text: 'Top button, match existing' } }] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least one cleaning item or another alteration/);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('buttons with a cleaning item are fine, one line with a quantity', async () => {
    const res = await booking({
      // 3 shirts ($26.97) + 4 buttons ($23.96) clears the $45 zone minimum
      dry_clean_items: [{ garment_type: 'shirt_blouse', quantity: 3 }],
      alteration_items: [{ garment_type: 'button', quantity: 4, instruction: { type: 'description', text: 'Cuff buttons, my own' } }],
    });
    expect(res.status).toBe(200);
    const items = (state.rpcCalls[0].p as { items: Row[] }).items;
    expect(items.find((i) => i.garment_type === 'button')).toMatchObject({ quantity: 4, subtotal: 23.96 });
  });

  it('refuses an alteration without a valid fit instruction', async () => {
    const res = await booking({ alteration_items: [hem({ type: 'amount', text: '1 inch' })] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/measurement or match a garment or pinned/);
  });

  it("refuses Express with alterations (they can't share an order)", async () => {
    vi.setSystemTime(new Date('2026-10-05T12:00:00-05:00'));
    const res = await booking({ alteration_items: [hem()], dry_clean_items: [{ garment_type: 'shirt_blouse', quantity: 2 }] }, { pickup_date: '2026-10-07', express_tier: 'express_24hr' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/can't share an order/);
  });

  it('accepts a photo only on a general repair', async () => {
    const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const bad = await booking({ alteration_items: [{ ...hem(), photo }], dry_clean_items: [{ garment_type: 'shirt_blouse', quantity: 1 }] });
    expect(bad.status).toBe(400);
    const notImage = await booking({
      alteration_items: [{ garment_type: 'general_repair', quantity: 1, instruction: { type: 'description', text: 'Torn pocket' }, photo: 'https://evil.example/x.jpg' }],
    });
    expect(notImage.status).toBe(400);
  });
});
