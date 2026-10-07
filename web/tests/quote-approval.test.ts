import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client 2026-10-06, Parts B-D: a quote above the 25% band waits for the
// customer. Approve -> charged with fee and tax and added to the order; a
// declined card -> Payment Needed. Decline -> returned unaltered, no charge.
// Ladder: reminder 24 h, staff call 48 h, returned after 5 business days.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const writes: Array<{ table: string; op: string; values: Row; filters: Row }> = [];
const single: Record<string, Row | null> = {};
let listRows: Row[] = [];
let lockSucceeds = true;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let op = 'select';
      const filters: Row = {};
      let selected = false;
      const b: Record<string, unknown> = {
        select: () => ((selected = true), b),
        insert: (v: Row) => (writes.push({ table, op: 'insert', values: v, filters }), (op = 'insert'), b),
        update: (v: Row) => (writes.push({ table, op: 'update', values: v, filters }), (op = 'update'), b),
        eq: (c: string, v: unknown) => ((filters[c] = v), b),
        not: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: single[table] ?? null, error: null }),
        then: (resolve: (r: unknown) => unknown) => {
          let data: unknown = null;
          if (op === 'update' && selected) data = lockSucceeds ? [{ id: 'x' }] : [];
          if (op === 'select') data = listRows;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return b;
    },
  }),
}));
const dispatch = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: (...a: unknown[]) => dispatch(...(a as [])) } }));
const reportError = vi.fn();
vi.mock('@/lib/error-reporting', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }), getClientIp: () => '127.0.0.1' }));

import { createAdminClient } from '@/lib/supabase/admin';
import { decideQuote } from '@/lib/quote-approval';
import { runQuoteLadder } from '@/lib/daily-jobs';
import { POST as quotePOST } from '@/app/api/orders/[id]/quote/route';
import { paymentWatchlists } from '@/lib/payment-state';

const supabase = () => createAdminClient() as unknown as Parameters<typeof decideQuote>[0];
const ORDER_ID = '58046cf5-aa31-47bf-853f-d6bebe06a2c6';
const ITEM_ID = 'aaaaaaaa-0000-4000-8000-000000000002';

let squareCalls: Array<{ path: string; body: Row | null }> = [];
function stubSquare(reply: { status: number; body: unknown }) {
  squareCalls = [];
  vi.stubGlobal('fetch', async (input: string, init: { body?: string }) => {
    squareCalls.push({ path: String(input).replace(/^https:\/\/connect\.squareupsandbox\.com\/v2/, ''), body: init.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
}

const originalEnv = { ...process.env };
beforeEach(() => {
  writes.length = 0;
  listRows = [];
  lockSucceeds = true;
  dispatch.mockClear();
  reportError.mockClear();
  single.order_items = { id: ITEM_ID, order_id: ORDER_ID, garment_type: 'sleeve', quantity: 1, quoted_unit_price: 70, quote_status: 'awaiting_approval', notes: 'Pinned' };
  single.orders = {
    id: ORDER_ID, order_number: 'F11-2026-QUOTE', subtotal: 29.99, environmental_fee: 0.9, sales_tax: 2.55, total: 33.44,
    amount_due: 0, payment_status: 'charged', payment_needed_since: null, square_customer_id: 'SQ_CUST', square_card_id: 'ccof:CARD',
  };
  process.env.SQUARE_ACCESS_TOKEN = 'EAAAtest-sandbox-token';
  process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID = 'LOC123';
  process.env.SQUARE_ENVIRONMENT = 'sandbox';
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

const orderUpdate = () => writes.find((w) => w.table === 'orders' && w.op === 'update')?.values;

describe('Approving or declining a quote', () => {
  it('approve: charges the quote with fee and tax and adds it to the order', async () => {
    stubSquare({ status: 200, body: { payment: { id: 'PAY_Q', status: 'COMPLETED' } } });
    const res = await decideQuote(supabase(), { orderId: ORDER_ID, itemId: ITEM_ID, decision: 'approve', actorLabel: 'Test' });
    // $70 + 3% fee ($2.10) = $72.10, + 8.25% tax ($5.95) = $78.05
    expect(res).toMatchObject({ ok: true, charged: 78.05 });
    expect(squareCalls[0].body).toMatchObject({ amount_money: { amount: 7805 }, source_id: 'ccof:CARD', idempotency_key: `quo_${ITEM_ID.replace(/-/g, '')}` });
    expect(orderUpdate()).toMatchObject({ subtotal: 99.99, environmental_fee: 3, sales_tax: 8.5, total: 111.49 });
    expect(writes).toContainEqual(expect.objectContaining({ table: 'order_payments', values: expect.objectContaining({ kind: 'quote', amount: 78.05, status: 'completed' }) }));
  });

  it('approve with a declined card: the work goes ahead and the order is Payment Needed for the quote', async () => {
    stubSquare({ status: 402, body: { errors: [{ detail: 'Card declined.' }] } });
    const res = await decideQuote(supabase(), { orderId: ORDER_ID, itemId: ITEM_ID, decision: 'approve', actorLabel: 'Test' });
    expect(res.ok).toBe(true);
    expect(orderUpdate()).toMatchObject({ payment_status: 'failed', amount_due: 78.05 });
    expect(orderUpdate()?.payment_needed_since).toEqual(expect.any(String));
  });

  it('decline: returned unaltered at no charge, nothing charged', async () => {
    stubSquare({ status: 500, body: {} });
    const res = await decideQuote(supabase(), { orderId: ORDER_ID, itemId: ITEM_ID, decision: 'decline', actorLabel: 'Test' });
    expect(res).toMatchObject({ ok: true, message: expect.stringContaining('unaltered at no charge') });
    expect(squareCalls).toHaveLength(0);
    expect(writes).toContainEqual(expect.objectContaining({ table: 'order_items', values: expect.objectContaining({ subtotal: 0 }) }));
  });

  it('answers a quote only once', async () => {
    lockSucceeds = false;
    stubSquare({ status: 200, body: { payment: { id: 'PAY_Q', status: 'COMPLETED' } } });
    const res = await decideQuote(supabase(), { orderId: ORDER_ID, itemId: ITEM_ID, decision: 'approve', actorLabel: 'Test' });
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(squareCalls).toHaveLength(0);
  });

  it('refuses a quote that is not waiting for an answer', async () => {
    single.order_items = { ...single.order_items, quote_status: 'within_band' };
    expect(await decideQuote(supabase(), { orderId: ORDER_ID, itemId: ITEM_ID, decision: 'approve', actorLabel: 'Test' })).toMatchObject({ ok: false, status: 409 });
  });

  it('the endpoint works only through the private link (order UUID)', async () => {
    const res = await quotePOST(
      new Request('http://localhost/api/orders/F11-2026-QUOTE/quote', { method: 'POST', body: JSON.stringify({ item_id: ITEM_ID, decision: 'approve' }) }),
      { params: Promise.resolve({ id: 'F11-2026-QUOTE' }) }
    );
    expect(res.status).toBe(404);
  });

  it('the tracking page and dashboard show the quote card', () => {
    const src = (rel: string) => readFileSync(join(__dirname, '..', 'src', ...rel.split('/')), 'utf8');
    expect(src('app/track/[orderId]/page.tsx')).toContain('<QuoteApprovalCard orderId={order.id} items={order.ticket.items} />');
    expect(src('app/dashboard/orders/[id]/page.tsx')).toContain('<QuoteApprovalCard orderId={order.id} items={order.items || []} />');
  });
});

describe('Quote ladder', () => {
  const now = new Date('2026-10-14T14:00:00Z'); // Wednesday
  const pending = (requestedAt: string, stage: number) => ({
    id: ITEM_ID, order_id: ORDER_ID, garment_type: 'sleeve', quantity: 1, quoted_unit_price: 70, notes: 'Pinned',
    quote_requested_at: requestedAt, quote_reminder_stage: stage,
    order: { id: ORDER_ID, order_number: 'F11-2026-QUOTE', status: 'in_cleaning', customer: { full_name: 'Ada', phone: '+12145550100', email: 'a@example.com' } },
  });

  it('reminds after 24 hours', async () => {
    listRows = [pending('2026-10-13T12:00:00Z', 0)];
    expect(await runQuoteLadder(supabase(), now)).toEqual({ reminded: 1, callsDue: 0, returned: 0 });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ customMessage: expect.stringContaining('$70.00') }));
  });

  it('asks staff to call after 48 hours', async () => {
    listRows = [pending('2026-10-12T12:00:00Z', 1)];
    expect(await runQuoteLadder(supabase(), now)).toEqual({ reminded: 0, callsDue: 1, returned: 0 });
    expect(reportError).toHaveBeenCalledWith('daily-job/quote-call', expect.any(String), expect.objectContaining({ alert: true }));
  });

  it('returns the item unaltered after 5 business days, at no charge', async () => {
    // Requested Wed 2026-10-07 (Dallas); 5 plant days later is Wed 2026-10-14
    listRows = [pending('2026-10-07T15:00:00Z', 2)];
    expect(await runQuoteLadder(supabase(), now)).toEqual({ reminded: 0, callsDue: 0, returned: 1 });
    expect(writes).toContainEqual(expect.objectContaining({ table: 'order_items', values: expect.objectContaining({ quote_status: 'returned', subtotal: 0 }) }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ customTitle: '🧵 Returned unaltered' }));
  });
});

describe('Mission Control lists quotes awaiting approval', () => {
  it('oldest first, with 48-hour quotes on the call list', () => {
    const lists = paymentWatchlists([
      {
        id: 'o1', order_number: 'A', status: 'in_cleaning', payment_status: 'charged',
        items: [{ id: 'i1', garment_type: 'sleeve', quantity: 1, quote_status: 'awaiting_approval', quoted_unit_price: 70, quote_requested_at: '2026-10-07T10:00:00Z', quote_reminder_stage: 2 }],
      },
      {
        id: 'o2', order_number: 'B', status: 'in_cleaning', payment_status: 'charged',
        items: [{ id: 'i2', garment_type: 'waist', quantity: 1, quote_status: 'awaiting_approval', quoted_unit_price: 55, quote_requested_at: '2026-10-08T10:00:00Z', quote_reminder_stage: 0 }],
      },
    ]);
    expect(lists.quotesAwaiting.map((q) => q.orderNumber)).toEqual(['A', 'B']);
    expect(lists.quoteCalls.map((q) => q.orderNumber)).toEqual(['A']);
  });
});
