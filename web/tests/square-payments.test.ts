import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal fake Supabase client: records writes, answers reads from fixtures
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const writes: { table: string; op: 'insert' | 'update'; values: Row }[] = [];
let fixtures: Record<string, Row | null> = {};

function builder(table: string) {
  let op: 'select' | 'insert' | 'update' = 'select';
  let values: Row = {};
  let isCount = false;
  const result = () => {
    if (isCount) return { count: 0, error: null };
    if (op === 'insert') return { data: { id: `${table}-new-id`, ...values }, error: null };
    if (op === 'update') return { data: { id: `${table}-updated`, ...values }, error: null };
    return { data: fixtures[table] ?? null, error: null };
  };
  const b: Record<string, unknown> = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) isCount = true;
      return b;
    },
    insert: (v: Row) => {
      op = 'insert';
      values = v;
      writes.push({ table, op, values: v });
      return b;
    },
    update: (v: Row) => {
      op = 'update';
      values = v;
      writes.push({ table, op, values: v });
      return b;
    },
    delete: () => b,
    eq: () => b,
    neq: () => b,
    ilike: () => b,
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
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: { id: 'staff-1', full_name: 'Intake Tester', role: 'intake_staff' }, user: {} }),
}));
vi.mock('@/lib/messaging', () => ({
  messagingService: { dispatchStageNotification: vi.fn(async () => ({ success: true })) },
}));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/storage', () => ({ resolveAndUploadPhotoUrl: async (url: string) => url }));

import { saveCardOnFile, chargeCardOnFile, getSquareConfig } from '@/lib/square';
import { calculateOrderFinancials, DRY_CLEAN_PRICES } from '@/lib/constants';
import { POST as bookingPOST } from '@/app/api/bookings/route';
import { POST as intakePOST } from '@/app/api/intake/route';

// ---------------------------------------------------------------------------
// Fake Square API
// ---------------------------------------------------------------------------
type SquareCall = { path: string; body: Record<string, unknown> };
let squareCalls: SquareCall[] = [];

function stubSquare(responses: Record<string, { status: number; body: unknown }>) {
  squareCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const path = url.replace(/^https:\/\/connect\.squareup(sandbox)?\.com\/v2/, '');
      squareCalls.push({ path, body: JSON.parse(String(init?.body || '{}')) });
      const r = responses[path] || { status: 404, body: { errors: [{ detail: 'not stubbed' }] } };
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    })
  );
}

const originalEnv = { ...process.env };

function useSandboxSquare() {
  process.env.SQUARE_ACCESS_TOKEN = 'EAAAtest-sandbox-token';
  process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID = 'LOC123';
  process.env.SQUARE_ENVIRONMENT = 'sandbox';
}

beforeEach(() => {
  writes.length = 0;
  fixtures = {};
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
  useSandboxSquare();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Next Monday in Texas time, always a valid future route day for Zone 1
function nextMonday(): string {
  const todayTx = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  const d = new Date(`${todayTx}T12:00:00`);
  d.setDate(d.getDate() + 2); // first Monday at least 2 days ahead (standard minimum, PR-12)
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  return d.toISOString().split('T')[0];
}

function bookingRequest(paymentToken: string | null) {
  return new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: { full_name: 'Pay Tester', email: 'pay.tester@example.com', phone: '2145550100' },
      address: { street: '100 Test St', city: 'Dallas', state: 'TX', zip: '75201' },
      services: { type: 'dry_clean', dry_clean_items: [{ garment_type: 'dress', quantity: 4 }], estimated_weight_lbs: 0 },
      schedule: { pickup_date: nextMonday(), pickup_window: 'morning', express_tier: 'standard', frequency: 'one_time' },
      payment_method: { card_brand: 'visa', last_4: '1111', payment_token: paymentToken },
      consents: { sms_order_updates: false, sms_promotions: false },
    }),
  });
}

// ---------------------------------------------------------------------------
describe('Square card-on-file helpers (SEC-06)', () => {
  it('creates a Square customer, then saves the card to it', async () => {
    stubSquare({
      '/customers': { status: 200, body: { customer: { id: 'SQ_CUST' } } },
      '/cards': { status: 200, body: { card: { id: 'ccof:CARD', card_brand: 'VISA', last_4: '1111' } } },
    });
    const result = await saveCardOnFile(getSquareConfig(), {
      cardToken: 'cnon:token',
      email: 'a@example.com',
      fullName: 'A Person',
      referenceId: 'cust-1',
    });
    expect(result).toEqual({ ok: true, card: { squareCustomerId: 'SQ_CUST', cardId: 'ccof:CARD', brand: 'VISA', last4: '1111' } });
    expect(squareCalls.map((c) => c.path)).toEqual(['/customers', '/cards']);
    expect(squareCalls[1].body).toMatchObject({ source_id: 'cnon:token', card: { customer_id: 'SQ_CUST' } });
  });

  it('reuses an existing Square customer', async () => {
    stubSquare({ '/cards': { status: 200, body: { card: { id: 'ccof:CARD2' } } } });
    const result = await saveCardOnFile(getSquareConfig(), {
      cardToken: 'cnon:token',
      existingSquareCustomerId: 'SQ_EXISTING',
      email: 'a@example.com',
      fullName: 'A Person',
      referenceId: 'cust-1',
    });
    expect(result.ok).toBe(true);
    expect(squareCalls.map((c) => c.path)).toEqual(['/cards']);
  });

  it('charges the saved card in cents with a deterministic idempotency key within Square limits', async () => {
    stubSquare({ '/payments': { status: 200, body: { payment: { id: 'PAY1', status: 'COMPLETED' } } } });
    const orderId = '58046cf5-aa31-47bf-853f-d6bebe06a2c6';
    const result = await chargeCardOnFile(getSquareConfig(), {
      squareCustomerId: 'SQ_CUST',
      cardId: 'ccof:CARD',
      amount: 50.17,
      orderId,
      orderNumber: 'F11-2026-TEST',
    });
    expect(result).toEqual({ ok: true, paymentId: 'PAY1', status: 'COMPLETED' });
    const body = squareCalls[0].body as { amount_money: { amount: number }; idempotency_key: string; source_id: string; location_id: string };
    expect(body.amount_money.amount).toBe(5017);
    expect(body.source_id).toBe('ccof:CARD');
    expect(body.location_id).toBe('LOC123');
    expect(body.idempotency_key.length).toBeLessThanOrEqual(45);
    expect(body.idempotency_key).toBe(`int_${orderId.replace(/-/g, '')}_5017`);
  });
});

describe('Booking stores a card on file and never marks an order charged (SEC-05)', () => {
  it('saves the card and creates the order as authorized with no payment ID', async () => {
    stubSquare({
      '/customers': { status: 200, body: { customer: { id: 'SQ_CUST' } } },
      '/cards': { status: 200, body: { card: { id: 'ccof:CARD' } } },
    });
    const res = await bookingPOST(bookingRequest('cnon:card-token'));
    expect(res.status).toBe(200);

    const order = writes.find((w) => w.table === 'orders' && w.op === 'insert')?.values;
    expect(order).toMatchObject({
      payment_status: 'authorized',
      payment_id: null,
      square_customer_id: 'SQ_CUST',
      square_card_id: 'ccof:CARD',
    });
    expect(writes).toContainEqual({ table: 'customers', op: 'update', values: { square_customer_id: 'SQ_CUST' } });
  });

  it('rejects the booking and creates no order when Square declines the card', async () => {
    stubSquare({
      '/customers': { status: 200, body: { customer: { id: 'SQ_CUST' } } },
      '/cards': { status: 400, body: { errors: [{ code: 'CARD_DECLINED', detail: 'Card declined.' }] } },
    });
    const res = await bookingPOST(bookingRequest('cnon:declined'));
    expect(res.status).toBe(402);
    expect(writes.some((w) => w.table === 'orders')).toBe(false);
  });

  it('requires a card token when Square is configured', async () => {
    stubSquare({});
    const res = await bookingPOST(bookingRequest(null));
    expect(res.status).toBe(400);
    expect(squareCalls).toHaveLength(0);
  });
});

describe('Intake charges the saved card for the full taxed total (SEC-05, SEC-06)', () => {
  const baseOrder = {
    id: '58046cf5-aa31-47bf-853f-d6bebe06a2c6',
    order_number: 'F11-2026-TEST',
    order_type: 'dry_clean',
    status: 'picked_up',
    pickup_date: '2026-10-06',
    pickup_window: 'morning',
    delivery_date: '2026-10-08',
    delivery_window: 'morning',
    weight_lbs: null,
    discount_amount: 0,
    express_tier: 'express_24hr',
    promo_code: 'KICKOFF15',
    payment_status: 'authorized',
    payment_id: null,
    square_customer_id: 'SQ_CUST',
    square_card_id: 'ccof:CARD',
    notes: 'Recurring Plan: Weekly',
    customer: { id: 'cust-1', full_name: 'Pay Tester', phone: '2145550100', email: 'pay.tester@example.com' },
  };

  function intakeRequest() {
    return new Request('http://localhost/api/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: baseOrder.id, weight_lbs: 0, dry_clean_items: [{ garment_type: 'dress', quantity: 4 }] }),
    });
  }

  it('includes Express surcharge, discounts, environmental fee and tax, and charges the saved card', async () => {
    fixtures.orders = { ...baseOrder };
    stubSquare({ '/payments': { status: 200, body: { payment: { id: 'PAY1', status: 'COMPLETED' } } } });

    const res = await intakePOST(intakeRequest());
    const body = await res.json();

    const expected = calculateOrderFinancials({
      subtotal: 4 * DRY_CLEAN_PRICES.dress.price,
      isExpress: true,
      discountPercent: 15,
      frequency: 'weekly',
    });
    expect(expected.salesTax).toBeGreaterThan(0);
    expect(body.total).toBe(expected.finalTotal);
    expect(body.payment_status).toBe('charged');

    const charge = squareCalls.find((c) => c.path === '/payments')?.body as { amount_money: { amount: number }; source_id: string };
    expect(charge.amount_money.amount).toBe(Math.round(expected.finalTotal * 100));
    expect(charge.source_id).toBe('ccof:CARD');

    const update = writes.find((w) => w.table === 'orders' && w.op === 'update')?.values;
    expect(update).toMatchObject({ payment_status: 'charged', payment_id: 'PAY1', total: expected.finalTotal });
  });

  it('puts an order with no card on file on Payment Hold and never uses a test token', async () => {
    fixtures.orders = { ...baseOrder, square_customer_id: null, square_card_id: null, payment_id: 'cnon:old-token' };
    stubSquare({});

    const res = await intakePOST(intakeRequest());
    const body = await res.json();

    expect(body.payment_status).toBe('failed');
    expect(squareCalls).toHaveLength(0);
  });
});
