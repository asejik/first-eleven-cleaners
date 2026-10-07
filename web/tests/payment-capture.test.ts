import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { captureOrderPayment, type CaptureOrder } from '@/lib/payment-capture';
import { amountOwed, chargeHeldOrder } from '@/lib/payment-recovery';

// ---------------------------------------------------------------------------
// Client 2026-10-06, Part A: intake captures the actual total automatically.
// Below the hold: lower it and capture. Above: capture it and charge the rest.
// No usable hold: charge the card on file. A decline -> Payment Needed for the
// amount still owed.
// ---------------------------------------------------------------------------
vi.mock('@/lib/error-reporting', () => ({ reportError: vi.fn() }));

type Row = Record<string, unknown>;
const writes: Array<{ table: string; op: string; values: Row; filters: Row }> = [];

function fakeSupabase() {
  const from = (table: string) => {
    let op = 'select';
    let values: Row = {};
    const filters: Row = {};
    const b: Record<string, unknown> = {
      insert: (v: Row) => {
        op = 'insert';
        values = v;
        writes.push({ table, op, values, filters });
        return b;
      },
      update: (v: Row) => {
        op = 'update';
        values = v;
        writes.push({ table, op, values, filters });
        return b;
      },
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return b;
      },
      select: () => b,
      then: (resolve: (r: unknown) => unknown) =>
        Promise.resolve({ data: op === 'update' ? [{ id: 'x' }] : null, error: null }).then(resolve),
    };
    return b;
  };
  return { from } as unknown as Parameters<typeof captureOrderPayment>[0];
}

type SquareReply = { status: number; body: unknown };
let squareCalls: Array<{ method: string; path: string; body: Row | null }> = [];

/** Replies by "METHOD /path"; the first match wins */
function stubSquare(replies: Record<string, SquareReply>) {
  squareCalls = [];
  vi.stubGlobal('fetch', async (input: string, init: { method: string; body?: string }) => {
    const path = String(input).replace(/^https:\/\/connect\.squareup(sandbox)?\.com\/v2/, '');
    squareCalls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : null });
    const r = replies[`${init.method} ${path}`] || { status: 404, body: { errors: [{ detail: 'not stubbed' }] } };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  });
}

const originalEnv = { ...process.env };
beforeEach(() => {
  writes.length = 0;
  process.env.SQUARE_ACCESS_TOKEN = 'EAAAtest-sandbox-token';
  process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID = 'LOC123';
  process.env.SQUARE_ENVIRONMENT = 'sandbox';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const heldOrder: CaptureOrder = {
  id: '58046cf5-aa31-47bf-853f-d6bebe06a2c6',
  order_number: 'F11-2026-HOLD',
  square_customer_id: 'SQ_CUST',
  square_card_id: 'ccof:CARD',
  hold_payment_id: 'HOLD_1',
  hold_amount: 96,
  hold_status: 'held',
  hold_expires_at: '2999-01-01T00:00:00Z',
};
const OK_COMPLETE = { status: 200, body: { payment: { id: 'HOLD_1', status: 'COMPLETED' } } };
const DECLINED = { status: 402, body: { errors: [{ code: 'CARD_DECLINED', detail: 'Card declined.' }] } };
const path = (c: { method: string; path: string }) => `${c.method} ${c.path}`;

describe('Intake capture from the card hold', () => {
  it('lowers the hold to a smaller total and captures it', async () => {
    stubSquare({
      'GET /payments/HOLD_1': { status: 200, body: { payment: { version_token: 'v1' } } },
      'PUT /payments/HOLD_1': { status: 200, body: { payment: { id: 'HOLD_1' } } },
      'POST /payments/HOLD_1/complete': OK_COMPLETE,
    });
    const res = await captureOrderPayment(fakeSupabase(), heldOrder, 80.5);
    expect(res).toMatchObject({ paymentStatus: 'charged', paymentId: 'HOLD_1', amountDue: 0, holdStatus: 'captured' });
    expect(squareCalls.map(path)).toEqual(['GET /payments/HOLD_1', 'PUT /payments/HOLD_1', 'POST /payments/HOLD_1/complete']);
    expect(squareCalls[1].body).toMatchObject({ payment: { amount_money: { amount: 8050 } } });
    expect(writes).toContainEqual(
      expect.objectContaining({ table: 'order_payments', op: 'update', values: expect.objectContaining({ amount: 80.5, status: 'completed' }) })
    );
  });

  it('captures an exact match without lowering it', async () => {
    stubSquare({ 'POST /payments/HOLD_1/complete': OK_COMPLETE });
    const res = await captureOrderPayment(fakeSupabase(), heldOrder, 96);
    expect(res.paymentStatus).toBe('charged');
    expect(squareCalls.map(path)).toEqual(['POST /payments/HOLD_1/complete']);
  });

  it('captures the whole hold and charges the rest to the card when the total is higher', async () => {
    stubSquare({
      'POST /payments/HOLD_1/complete': OK_COMPLETE,
      'POST /payments': { status: 200, body: { payment: { id: 'TOPUP_1', status: 'COMPLETED' } } },
    });
    const res = await captureOrderPayment(fakeSupabase(), heldOrder, 130.25);
    expect(res).toMatchObject({ paymentStatus: 'charged', paymentId: 'HOLD_1', amountDue: 0, holdStatus: 'captured' });
    const topUp = squareCalls.find((c) => path(c) === 'POST /payments');
    expect(topUp?.body).toMatchObject({ amount_money: { amount: 3425 }, source_id: 'ccof:CARD', autocomplete: true });
    expect(writes).toContainEqual(
      expect.objectContaining({ table: 'order_payments', op: 'insert', values: expect.objectContaining({ kind: 'top_up', amount: 34.25, status: 'completed' }) })
    );
  });

  it('marks Payment Needed for only the rest when the extra charge is declined', async () => {
    stubSquare({ 'POST /payments/HOLD_1/complete': OK_COMPLETE, 'POST /payments': DECLINED });
    const res = await captureOrderPayment(fakeSupabase(), heldOrder, 130.25);
    expect(res).toMatchObject({ paymentStatus: 'failed', paymentId: 'HOLD_1', amountDue: 34.25, holdStatus: 'captured' });
    expect(res.note).toContain('remaining $34.25 was declined');
  });

  it('charges the card on file when there is no hold', async () => {
    stubSquare({ 'POST /payments': { status: 200, body: { payment: { id: 'PAY_9', status: 'COMPLETED' } } } });
    const res = await captureOrderPayment(fakeSupabase(), { ...heldOrder, hold_status: 'scheduled', hold_payment_id: null }, 70);
    expect(res).toMatchObject({ paymentStatus: 'charged', paymentId: 'PAY_9', amountDue: 0 });
    expect(squareCalls.map(path)).toEqual(['POST /payments']);
  });

  it('marks Payment Needed for the whole total when the card is declined', async () => {
    stubSquare({ 'POST /payments': DECLINED });
    const res = await captureOrderPayment(fakeSupabase(), { ...heldOrder, hold_status: 'none', hold_payment_id: null }, 70);
    expect(res).toMatchObject({ paymentStatus: 'failed', paymentId: null, amountDue: 70 });
  });

  it('never captures more than the total: releases a hold it cannot lower and charges the card', async () => {
    stubSquare({
      'GET /payments/HOLD_1': { status: 200, body: { payment: { version_token: 'v1' } } },
      'PUT /payments/HOLD_1': { status: 400, body: { errors: [{ detail: 'Cannot update.' }] } },
      'POST /payments/HOLD_1/cancel': { status: 200, body: { payment: { status: 'CANCELED' } } },
      'POST /payments': { status: 200, body: { payment: { id: 'PAY_2', status: 'COMPLETED' } } },
    });
    const res = await captureOrderPayment(fakeSupabase(), heldOrder, 50);
    expect(res).toMatchObject({ paymentStatus: 'charged', paymentId: 'PAY_2', holdStatus: 'released' });
    expect(squareCalls.map(path)).not.toContain('POST /payments/HOLD_1/complete');
    expect(squareCalls.map(path)).toContain('POST /payments/HOLD_1/cancel');
  });

  it('charges the card when Square can no longer capture the hold', async () => {
    stubSquare({
      'POST /payments/HOLD_1/complete': { status: 400, body: { errors: [{ detail: 'Payment is CANCELED.' }] } },
      'POST /payments': { status: 200, body: { payment: { id: 'PAY_3', status: 'COMPLETED' } } },
    });
    const res = await captureOrderPayment(fakeSupabase(), heldOrder, 96);
    expect(res).toMatchObject({ paymentStatus: 'charged', paymentId: 'PAY_3', holdStatus: 'expired' });
  });

  it('treats a hold past its expiry as gone and charges the card', async () => {
    stubSquare({ 'POST /payments': { status: 200, body: { payment: { id: 'PAY_4', status: 'COMPLETED' } } } });
    const res = await captureOrderPayment(fakeSupabase(), { ...heldOrder, hold_expires_at: '2020-01-01T00:00:00Z' }, 60);
    expect(res.paymentId).toBe('PAY_4');
    expect(squareCalls.map(path)).toEqual(['POST /payments']);
  });
});

describe('Paying what is still owed (Payment Needed)', () => {
  it('owes the rest after a partial capture, else the total', () => {
    expect(amountOwed({ total: 130.25, amount_due: 34.25 })).toBe(34.25);
    expect(amountOwed({ total: 70, amount_due: 0 })).toBe(70);
    expect(amountOwed({ total: 70, amount_due: null })).toBe(70);
  });

  it('charges only the rest, keeps the captured hold as the main payment and clears Payment Needed', async () => {
    stubSquare({ 'POST /payments': { status: 200, body: { payment: { id: 'PAY_REST', status: 'COMPLETED' } } } });
    const supabase = fakeSupabase() as unknown as Parameters<typeof chargeHeldOrder>[0];
    const res = await chargeHeldOrder(
      supabase,
      { ...heldOrder, total: 130.25, amount_due: 34.25, payment_id: 'HOLD_1', payment_status: 'failed' },
      { keyPrefix: 'rty', actorLabel: 'Test' }
    );
    expect(res).toEqual({ ok: true, paymentId: 'PAY_REST', amount: 34.25 });
    expect(squareCalls[0].body).toMatchObject({ amount_money: { amount: 3425 } });
    const paid = writes.find((w) => w.table === 'orders' && w.values.payment_status === 'charged');
    expect(paid?.values).toMatchObject({ payment_id: 'HOLD_1', amount_due: 0, payment_needed_since: null, payment_reminder_stage: 0 });
    expect(writes).toContainEqual(
      expect.objectContaining({ table: 'order_payments', op: 'insert', values: expect.objectContaining({ square_payment_id: 'PAY_REST', amount: 34.25 }) })
    );
  });
});
