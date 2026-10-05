import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-04: an order on Payment Hold (card declined at intake) can be recovered:
// staff retry the charge or record a Square Dashboard payment, and the customer
// can pay with a new card from the tracking link.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Write = { table: string; op: 'insert' | 'update'; values: Row; filters: Row };
const writes: Write[] = [];
let orderFixture: Row | null = null;
let customerFixture: Row | null = null;
let paymentIdOwner: Row | null = null;

function builder(table: string) {
  let op: 'select' | 'insert' | 'update' = 'select';
  const filters: Row = {};
  const result = () => {
    if (op === 'update' && table === 'orders') {
      const matches =
        !orderFixture ||
        ((filters.payment_status === undefined || orderFixture.payment_status === filters.payment_status) &&
          (filters.status === undefined || orderFixture.status === filters.status));
      if (matches && orderFixture) {
        const last = writes[writes.length - 1];
        orderFixture = { ...orderFixture, ...last.values };
      }
      return { data: matches ? [{ id: 'order-1' }] : [], error: null };
    }
    if (op !== 'select') return { data: [{ id: `${table}-row` }], error: null };
    if (table === 'orders') return { data: 'payment_id' in filters ? paymentIdOwner : orderFixture, error: null };
    if (table === 'customers') return { data: customerFixture, error: null };
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (v: Row) => {
      op = 'insert';
      writes.push({ table, op, values: v, filters });
      return b;
    },
    update: (v: Row) => {
      op = 'update';
      writes.push({ table, op, values: v, filters });
      return b;
    },
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return b;
    },
    or: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: async () => result(),
    single: async () => result(),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return b;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}));
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: { id: 'admin-1', full_name: 'Ops Admin', role: 'admin' }, user: {} }),
  getAuthenticatedCustomer: async () => ({ customer: null, user: null }),
}));
vi.mock('@/lib/messaging', () => ({
  messagingService: { dispatchStageNotification: vi.fn(async () => ({ success: true })) },
}));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/storage', () => ({ withSignedPhotoUrls: async <T,>(v: T) => v }));

import { POST as missionControlPOST } from '@/app/api/mission-control/route';
import { GET as orderGET } from '@/app/api/orders/[id]/route';
import { POST as payPOST } from '@/app/api/orders/[id]/pay/route';

const ORDER_ID = '11111111-2222-3333-4444-555555555555';

type SquareCall = { path: string; method: string; body: Row };
let squareCalls: SquareCall[] = [];
function stubSquare(responses: Record<string, { status: number; body: unknown }>) {
  squareCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input).replace(/^https:\/\/connect\.squareup(sandbox)?\.com\/v2/, '');
      squareCalls.push({ path, method: String(init?.method || 'GET'), body: JSON.parse(String(init?.body || '{}')) });
      const key = Object.keys(responses).find((k) => path.startsWith(k));
      const r = key ? responses[key] : { status: 404, body: { errors: [{ detail: 'not stubbed' }] } };
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    })
  );
}

const heldOrder = (overrides: Row = {}): Row => ({
  id: ORDER_ID,
  order_number: 'F11-2026-HOLD0001',
  status: 'weighed_itemized',
  payment_status: 'failed',
  payment_id: null,
  total: 56.83,
  customer_id: 'cust-1',
  square_customer_id: 'SQ_CUST_1',
  square_card_id: 'ccof:old-card',
  customer: { id: 'cust-1', full_name: 'Hold Tester', email: 'hold@example.com', phone: '+12145550100' },
  items: [],
  events: [],
  photos: [],
  ...overrides,
});

const mc = (body: Row) =>
  missionControlPOST(
    new Request('http://localhost/api/mission-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: ORDER_ID, ...body }),
    })
  );
const pay = (body: Row) =>
  payPOST(
    new Request(`http://localhost/api/orders/${ORDER_ID}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ORDER_ID }) }
  );

const originalEnv = { ...process.env };
beforeEach(() => {
  writes.length = 0;
  orderFixture = heldOrder();
  customerFixture = { id: 'cust-1', full_name: 'Hold Tester', email: 'hold@example.com', square_customer_id: 'SQ_CUST_1' };
  paymentIdOwner = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
  process.env.SQUARE_ACCESS_TOKEN = 'EAAAtest-sandbox-token';
  process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID = 'LOC123';
  process.env.SQUARE_ENVIRONMENT = 'sandbox';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Staff can recover a held order (PR-04)', () => {
  it('Retry charge charges the stored total to the saved card and clears the hold', async () => {
    stubSquare({ '/payments': { status: 200, body: { payment: { id: 'PAY_RETRY_1', status: 'COMPLETED' } } } });
    const res = await mc({ action: 'retry_charge' });
    expect(res.status).toBe(200);
    expect(squareCalls[0].body).toMatchObject({ source_id: 'ccof:old-card', amount_money: { amount: 5683, currency: 'USD' } });
    expect(String(squareCalls[0].body.idempotency_key)).toMatch(/^rty_11111111222233334444555555555555_\d+$/);
    expect(orderFixture?.payment_status).toBe('charged');
    expect(orderFixture?.payment_id).toBe('PAY_RETRY_1');
  });

  it('a declined retry leaves the order on hold', async () => {
    stubSquare({ '/payments': { status: 402, body: { errors: [{ code: 'CARD_DECLINED', detail: 'Card declined.' }] } } });
    const res = await mc({ action: 'retry_charge' });
    expect(res.status).toBe(402);
    expect(orderFixture?.payment_status).toBe('failed');
  });

  it('never charges an order that is not on hold', async () => {
    orderFixture = heldOrder({ payment_status: 'charged', payment_id: 'PAY_DONE' });
    stubSquare({});
    const res = await mc({ action: 'retry_charge' });
    expect(res.status).toBe(409);
    expect(squareCalls).toHaveLength(0);
  });

  it('Mark paid records a verified Square Dashboard payment', async () => {
    stubSquare({ '/payments/PAY_PHONE_1': { status: 200, body: { payment: { status: 'COMPLETED', amount_money: { amount: 5683 } } } } });
    const res = await mc({ action: 'mark_paid_external', square_payment_id: 'PAY_PHONE_1' });
    expect(res.status).toBe(200);
    expect(orderFixture?.payment_status).toBe('charged');
    expect(orderFixture?.payment_id).toBe('PAY_PHONE_1');
    const event = writes.find((w) => w.table === 'order_events');
    expect(String(event?.values.triggered_by)).toContain('Ops Admin');
  });

  it('Mark paid refuses a payment smaller than the order total', async () => {
    stubSquare({ '/payments/PAY_SMALL': { status: 200, body: { payment: { status: 'COMPLETED', amount_money: { amount: 1000 } } } } });
    const res = await mc({ action: 'mark_paid_external', square_payment_id: 'PAY_SMALL' });
    expect(res.status).toBe(400);
    expect(orderFixture?.payment_status).toBe('failed');
  });

  it('Mark paid refuses a payment already used by another order', async () => {
    paymentIdOwner = { id: 'other-order' };
    stubSquare({});
    const res = await mc({ action: 'mark_paid_external', square_payment_id: 'PAY_REUSED' });
    expect(res.status).toBe(409);
  });
});

describe('Customers can pay a held order from the tracking link (PR-04)', () => {
  it('the public tracking view shows the amount due only while on hold', async () => {
    const held = await (await orderGET(new Request(`http://localhost/api/orders/${ORDER_ID}`), { params: Promise.resolve({ id: ORDER_ID }) })).json();
    expect(held.order.payment_hold).toBe(true);
    expect(held.order.amount_due).toBe(56.83);

    orderFixture = heldOrder({ payment_status: 'charged' });
    const paid = await (await orderGET(new Request(`http://localhost/api/orders/${ORDER_ID}`), { params: Promise.resolve({ id: ORDER_ID }) })).json();
    expect(paid.order.payment_hold).toBe(false);
    expect(paid.order.amount_due).toBeUndefined();
  });

  it('saves the new card and charges the stored total (never an amount from the browser)', async () => {
    stubSquare({
      '/cards': { status: 200, body: { card: { id: 'ccof:new-card', card_brand: 'VISA', last_4: '1111' } } },
      '/payments': { status: 200, body: { payment: { id: 'PAY_CUSTOMER_1', status: 'COMPLETED' } } },
    });
    const res = await pay({ card_token: 'cnon:card-nonce-ok', amount: 1 });
    expect(res.status).toBe(200);
    const charge = squareCalls.find((c) => c.path === '/payments');
    expect(charge?.body).toMatchObject({ source_id: 'ccof:new-card', customer_id: 'SQ_CUST_1', amount_money: { amount: 5683 } });
    expect(orderFixture?.payment_status).toBe('charged');
    expect(orderFixture?.square_card_id).toBe('ccof:new-card');
  });

  it('refuses when the order is not on hold', async () => {
    orderFixture = heldOrder({ payment_status: 'charged' });
    stubSquare({});
    const res = await pay({ card_token: 'cnon:card-nonce-ok' });
    expect(res.status).toBe(409);
    expect(squareCalls).toHaveLength(0);
  });

  it('a declined new card leaves the order on hold', async () => {
    stubSquare({ '/cards': { status: 400, body: { errors: [{ code: 'CARD_DECLINED', detail: 'Card declined.' }] } } });
    const res = await pay({ card_token: 'cnon:card-nonce-declined' });
    expect(res.status).toBe(402);
    expect(orderFixture?.payment_status).toBe('failed');
  });

  it('rejects a missing card token', async () => {
    const res = await pay({});
    expect(res.status).toBe(400);
  });
});
