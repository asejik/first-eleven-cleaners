import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-05: refunds are issued through Square from the app, and the order's refund
// state always matches Square (partial refunds don't mark the order fully
// refunded, and a late payment.updated event can't undo a refund).
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Write = { table: string; op: 'insert' | 'update'; values: Row; filters: Row };
const writes: Write[] = [];
const fixtures: Record<string, Row | null> = {};

function builder(table: string) {
  let op: 'select' | 'insert' | 'update' = 'select';
  const filters: Row = {};
  const result = () => {
    if (op === 'update') {
      const row = fixtures[table];
      const matches = !row || Object.entries(filters).every(([k, v]) => k === 'id' || row[k] === v);
      if (matches && row) fixtures[table] = { ...row, ...writes[writes.length - 1].values };
      return { data: matches ? [{ id: `${table}-row` }] : [], error: null };
    }
    if (op === 'insert') return { data: [{ id: `${table}-row` }], error: null };
    return { data: fixtures[table] ?? null, error: null };
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
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: { id: 'admin-1', full_name: 'Ops Admin', role: 'admin' }, user: {} }),
}));
vi.mock('@/lib/messaging', () => ({
  messagingService: { dispatchStageNotification: vi.fn(async () => ({ success: true })) },
}));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 99 }),
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/storage', () => ({ withSignedPhotoUrls: async <T,>(v: T) => v }));

import { POST as webhookPOST } from '@/app/api/payments/webhook/route';
import { POST as missionControlPOST } from '@/app/api/mission-control/route';

type SquareCall = { path: string; method: string; body: Row };
let squareCalls: SquareCall[] = [];
function stubSquare(responses: Record<string, { status: number; body: unknown }>) {
  squareCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input).replace(/^https:\/\/connect\.squareup(sandbox)?\.com\/v2/, '');
      squareCalls.push({ path, method: String(init?.method || 'GET'), body: JSON.parse(String(init?.body || '{}')) });
      const r = responses[path] || { status: 404, body: { errors: [{ detail: 'not stubbed' }] } };
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    })
  );
}

const squarePayment = (refundedCents: number) => ({
  status: 200,
  body: { payment: { id: 'PAY_1', status: 'COMPLETED', amount_money: { amount: 5683 }, refunded_money: { amount: refundedCents } } },
});

const chargedOrder = (overrides: Row = {}): Row => ({
  id: '11111111-2222-3333-4444-555555555555',
  order_number: 'F11-2026-RFND0001',
  status: 'delivered',
  total: 56.83,
  payment_status: 'charged',
  payment_id: 'PAY_1',
  refunded_amount: 0,
  ...overrides,
});

const webhook = (body: Row) =>
  webhookPOST(new Request('http://localhost/api/payments/webhook', { method: 'POST', body: JSON.stringify(body) }));
const refundEvent = (status: string, cents: number) => ({
  type: 'refund.updated',
  data: { object: { refund: { id: 'RF_1', payment_id: 'PAY_1', status, amount_money: { amount: cents } } } },
});

const originalEnv = { ...process.env };
beforeEach(() => {
  writes.length = 0;
  for (const k of Object.keys(fixtures)) delete fixtures[k];
  fixtures.orders = chargedOrder();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
  process.env.SQUARE_ACCESS_TOKEN = 'EAAAtest-sandbox-token';
  process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID = 'LOC123';
  process.env.SQUARE_ENVIRONMENT = 'sandbox';
  delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Square webhook keeps refund state in step with Square (PR-05)', () => {
  it('a partial refund records the amount and keeps the order charged', async () => {
    stubSquare({ '/payments/PAY_1': squarePayment(500) });
    expect((await webhook(refundEvent('COMPLETED', 500))).status).toBe(200);
    expect(fixtures.orders?.refunded_amount).toBe(5);
    expect(fixtures.orders?.payment_status).toBe('charged');
  });

  it('a full refund marks the order refunded', async () => {
    stubSquare({ '/payments/PAY_1': squarePayment(5683) });
    await webhook(refundEvent('COMPLETED', 5683));
    expect(fixtures.orders?.refunded_amount).toBe(56.83);
    expect(fixtures.orders?.payment_status).toBe('refunded');
  });

  it('a later payment.updated event does not turn a refunded order back into charged', async () => {
    fixtures.orders = chargedOrder({ payment_status: 'refunded', refunded_amount: 56.83 });
    stubSquare({ '/payments/PAY_1': squarePayment(5683) });
    await webhook({ type: 'payment.updated', data: { object: { payment: { id: 'PAY_1', status: 'COMPLETED' } } } });
    expect(fixtures.orders?.payment_status).toBe('refunded');
  });

  it('a completed card hold does not mark an order paid while part of it is still owed (client 2026-10-06, Part A)', async () => {
    fixtures.orders = chargedOrder({ payment_status: 'failed', amount_due: 34.25 });
    stubSquare({ '/payments/PAY_1': squarePayment(0) });
    await webhook({ type: 'payment.updated', data: { object: { payment: { id: 'PAY_1', status: 'COMPLETED' } } } });
    expect(fixtures.orders?.payment_status).toBe('failed');
  });
});

describe('Claim refunds go through Square (PR-05)', () => {
  const resolve = (body: Row) =>
    missionControlPOST(
      new Request('http://localhost/api/mission-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve_claim', claim_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', ...body }),
      })
    );

  beforeEach(() => {
    fixtures.claims = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      order_id: '11111111-2222-3333-4444-555555555555',
      status: 'open',
      refund_amount: null,
      square_refund_id: null,
    };
  });

  it('refunds the approved amount to the card and records it on the claim and order', async () => {
    stubSquare({ '/refunds': { status: 200, body: { refund: { id: 'RF_CLAIM_1', status: 'PENDING' } } } });
    const res = await resolve({ refund_amount: 20, resolution_notes: 'Damaged collar' });
    expect(res.status).toBe(200);
    expect(squareCalls[0].body).toMatchObject({ payment_id: 'PAY_1', amount_money: { amount: 2000, currency: 'USD' } });
    expect(String(squareCalls[0].body.idempotency_key)).toBe('clm_aaaaaaaabbbbccccddddeeeeeeeeeeee');
    expect(fixtures.claims).toMatchObject({ status: 'refunded', refund_amount: 20, square_refund_id: 'RF_CLAIM_1' });
    expect(fixtures.orders?.refunded_amount).toBe(20);
    expect(fixtures.orders?.payment_status).toBe('charged');
  });

  it('refuses a refund larger than what is left on the payment', async () => {
    fixtures.orders = chargedOrder({ refunded_amount: 50 });
    stubSquare({});
    const res = await resolve({ refund_amount: 10 });
    expect(res.status).toBe(400);
    expect(squareCalls).toHaveLength(0);
    expect(fixtures.claims?.status).toBe('open');
  });

  it('leaves the claim open when Square declines the refund', async () => {
    stubSquare({ '/refunds': { status: 400, body: { errors: [{ code: 'REFUND_DECLINED', detail: 'Declined' }] } } });
    const res = await resolve({ refund_amount: 20 });
    expect(res.status).toBe(402);
    expect(fixtures.claims?.status).toBe('open');
    expect(fixtures.orders?.refunded_amount).toBe(0);
  });

  it('never refunds the same claim twice', async () => {
    fixtures.claims = { ...fixtures.claims, status: 'refunded', refund_amount: 20, square_refund_id: 'RF_OLD' };
    stubSquare({});
    const res = await resolve({ refund_amount: 20 });
    expect(res.status).toBe(409);
    expect(squareCalls).toHaveLength(0);
  });

  it('refuses a refund on an order that was never charged', async () => {
    fixtures.orders = chargedOrder({ payment_status: 'authorized', payment_id: null });
    stubSquare({});
    const res = await resolve({ refund_amount: 5 });
    expect(res.status).toBe(400);
    expect(squareCalls).toHaveLength(0);
  });

  it('a resolution without money still resolves the claim', async () => {
    stubSquare({});
    const res = await resolve({ resolution_notes: 'Free re-clean scheduled' });
    expect(res.status).toBe(200);
    expect(fixtures.claims?.status).toBe('resolved');
    expect(squareCalls).toHaveLength(0);
  });
});
