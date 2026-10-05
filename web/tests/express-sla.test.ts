import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-01: the Express late-delivery guarantee must use Texas time and must only
// tell the customer "refunded" after Square has actually accepted a refund.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const writes: { table: string; op: 'insert' | 'update'; values: Row }[] = [];

function builder(table: string) {
  let op: 'select' | 'insert' | 'update' = 'select';
  let values: Row = {};
  const result = () => ({ data: op === 'select' ? null : [{ id: `${table}-row`, ...values }], error: null });
  const b: Record<string, unknown> = {
    select: () => b,
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
    eq: () => b,
    maybeSingle: async () => result(),
    single: async () => result(),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return b;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}));

const dispatch = vi.fn<(payload: Record<string, unknown>) => Promise<{ success: boolean }>>(async () => ({
  success: true,
}));
vi.mock('@/lib/messaging', () => ({
  messagingService: { dispatchStageNotification: (p: Record<string, unknown>) => dispatch(p) },
}));

import { handleExpressDeliverySLA } from '@/lib/express';

type SquareCall = { path: string; body: Record<string, unknown> };
let squareCalls: SquareCall[] = [];

function stubSquare(refundResponse: { status: number; body: unknown }) {
  squareCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input).replace(/^https:\/\/connect\.squareup(sandbox)?\.com\/v2/, '');
      squareCalls.push({ path, body: JSON.parse(String(init?.body || '{}')) });
      const r = path === '/refunds' ? refundResponse : { status: 404, body: { errors: [{ detail: 'not stubbed' }] } };
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    })
  );
}

const originalEnv = { ...process.env };

function expressOrder(overrides: Row = {}) {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    order_number: 'F11-2026-EXPR0001',
    express_tier: 'express_24hr',
    delivery_date: '2026-10-06',
    subtotal: 100,
    express_surcharge: 50,
    total: 167.23,
    payment_status: 'charged',
    payment_id: 'sq_payment_123',
    express_auto_refunded: false,
    customer: { id: 'cust-1', full_name: 'Express Tester', phone: '+12145550100', email: 'express@example.com' },
    ...overrides,
  };
}

// 2026-10-06 is a Tuesday; Dallas is on CDT (UTC-5)
const ON_TIME_8AM_CDT = new Date('2026-10-06T13:00:00Z');
const LATE_1030AM_CDT = new Date('2026-10-06T15:30:00Z');

beforeEach(() => {
  writes.length = 0;
  dispatch.mockClear();
  process.env.TZ = 'UTC'; // Vercel functions run in UTC
  process.env.SQUARE_ACCESS_TOKEN = 'EAAAtest-sandbox-token';
  process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID = 'LOC123';
  process.env.SQUARE_ENVIRONMENT = 'sandbox';
  stubSquare({ status: 200, body: { refund: { id: 'rf_1', status: 'PENDING' } } });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const refundWrites = () =>
  writes.filter((w) => w.table === 'orders' && w.op === 'update' && w.values.express_auto_refunded === true);

describe('Express SLA deadline uses Texas time (PR-01)', () => {
  it('an 8:00 AM Central delivery on the promised date is on time', async () => {
    const result = await handleExpressDeliverySLA(expressOrder(), ON_TIME_8AM_CDT);
    expect(result.isMissedSLA).toBe(false);
    expect(squareCalls).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalled();
    expect(refundWrites()).toHaveLength(0);
  });

  it('a 10:30 AM Central delivery is late', async () => {
    const result = await handleExpressDeliverySLA(expressOrder(), LATE_1030AM_CDT);
    expect(result.isMissedSLA).toBe(true);
  });

  it('a delivery on a later day is late even in the morning', async () => {
    const result = await handleExpressDeliverySLA(expressOrder(), new Date('2026-10-07T13:00:00Z'));
    expect(result.isMissedSLA).toBe(true);
  });
});

describe('Express SLA refund goes through Square before the customer is told (PR-01)', () => {
  it('refunds the stored surcharge plus its fee and tax, once per order', async () => {
    const result = await handleExpressDeliverySLA(expressOrder({ express_surcharge: 20 }), LATE_1030AM_CDT);

    // $20 surcharge + 3% fee ($0.60) + 8.25% tax on $20.60 ($1.70) = $22.30
    expect(squareCalls).toHaveLength(1);
    expect(squareCalls[0].path).toBe('/refunds');
    expect(squareCalls[0].body.payment_id).toBe('sq_payment_123');
    expect(squareCalls[0].body.amount_money).toEqual({ amount: 2230, currency: 'USD' });
    expect(String(squareCalls[0].body.idempotency_key)).toContain('11111111222233334444555555555555');
    expect(result.refundAmount).toBe(22.3);

    expect(refundWrites()).toHaveLength(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(String(dispatch.mock.calls[0][0].customMessage)).toMatch(/refunded/i);
  });

  it('does not tell the customer "refunded" when Square rejects the refund', async () => {
    stubSquare({ status: 400, body: { errors: [{ code: 'REFUND_DECLINED', detail: 'Refund declined' }] } });
    const result = await handleExpressDeliverySLA(expressOrder(), LATE_1030AM_CDT);

    expect(result.isMissedSLA).toBe(true);
    expect(refundWrites()).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalled();
    const event = writes.find((w) => w.table === 'order_events');
    expect(String(event?.values.note)).toMatch(/refund failed/i);
  });

  it('does not refund or notify when the order was never charged', async () => {
    const result = await handleExpressDeliverySLA(
      expressOrder({ payment_status: 'authorized', payment_id: null }),
      LATE_1030AM_CDT
    );
    expect(result.isMissedSLA).toBe(true);
    expect(squareCalls).toHaveLength(0);
    expect(refundWrites()).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('never refunds an order twice', async () => {
    await handleExpressDeliverySLA(expressOrder({ express_auto_refunded: true }), LATE_1030AM_CDT);
    expect(squareCalls).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('never texts a made-up number when the customer has no phone', async () => {
    await handleExpressDeliverySLA(
      expressOrder({ customer: { id: 'cust-2', full_name: 'No Phone', phone: '', email: 'nophone@example.com' } }),
      LATE_1030AM_CDT
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].customerPhone).not.toBe('+12145550199');
    expect(dispatch.mock.calls[0][0].smsConsent).toBe(false);
  });
});
