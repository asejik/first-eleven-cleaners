import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client 2026-10-06, Part A: the daily job places holds 2 days before pickup,
// marks expired holds, and runs the Payment Needed ladder (24 h reminder, 48 h
// staff call, 7 days owner decision). A declined pre-pickup hold lets the
// customer add a new card from the tracking link.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const writes: Array<{ table: string; op: string; values: Row; filters: Row }> = [];
/** Rows a select on each table returns (filters are not applied: each test sets what matches) */
const selectRows: Record<string, Row[]> = {};
let singleRow: Record<string, Row | null> = {};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let op = 'select';
      let values: Row = {};
      const filters: Row = {};
      const b: Record<string, unknown> = {
        select: () => b,
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
        eq: (c: string, v: unknown) => ((filters[c] = v), b),
        neq: () => b,
        in: () => b,
        lt: () => b,
        lte: () => b,
        not: () => b,
        is: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: singleRow[table] ?? null, error: null }),
        then: (resolve: (r: unknown) => unknown) =>
          Promise.resolve({ data: op === 'select' ? selectRows[table] || [] : selectRows[`${table}:${op}`] || [], error: null }).then(resolve),
      };
      return b;
    },
  }),
}));
const dispatch = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: (...a: unknown[]) => dispatch(...(a as [])) } }));
const reportError = vi.fn();
vi.mock('@/lib/error-reporting', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { createAdminClient } from '@/lib/supabase/admin';
import { placeScheduledHolds, markExpiredHolds, runPaymentNeededLadder } from '@/lib/daily-jobs';
import { GET as cronGET } from '@/app/api/cron/daily/route';
import { GET as routeCheckGET } from '@/app/api/cron/route-check/route';
import { POST as holdCardPOST } from '@/app/api/orders/[id]/hold-card/route';

const supabase = () => createAdminClient() as unknown as Parameters<typeof placeScheduledHolds>[0];
let squareCalls: Array<{ path: string; body: Row | null }> = [];
function stubSquare(replies: Record<string, { status: number; body: unknown }>) {
  squareCalls = [];
  vi.stubGlobal('fetch', async (input: string, init: { body?: string }) => {
    const path = String(input).replace(/^https:\/\/connect\.squareupsandbox\.com\/v2/, '');
    squareCalls.push({ path, body: init.body ? JSON.parse(init.body) : null });
    const r = replies[path] || { status: 404, body: { errors: [{ detail: 'not stubbed' }] } };
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
}

const originalEnv = { ...process.env };
beforeEach(() => {
  writes.length = 0;
  for (const k of Object.keys(selectRows)) delete selectRows[k];
  singleRow = {};
  dispatch.mockClear();
  reportError.mockClear();
  process.env.SQUARE_ACCESS_TOKEN = 'EAAAtest-sandbox-token';
  process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID = 'LOC123';
  process.env.SQUARE_ENVIRONMENT = 'sandbox';
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

const ORDER_ID = '58046cf5-aa31-47bf-853f-d6bebe06a2c6';
const scheduled = {
  id: ORDER_ID,
  order_number: 'F11-2026-SCHED',
  pickup_date: '2026-10-09',
  hold_amount: 85.58,
  square_customer_id: 'SQ_CUST',
  square_card_id: 'ccof:CARD',
  customer: { full_name: 'Ada Lovelace', phone: '+12145550100', email: 'ada@example.com' },
};

describe('Holds placed 2 days before pickup', () => {
  it('places the hold and marks the order authorized', async () => {
    selectRows.orders = [scheduled];
    stubSquare({ '/payments': { status: 200, body: { payment: { id: 'HOLD_9', status: 'APPROVED', delayed_until: '2026-10-14T14:00:00Z' } } } });
    expect(await placeScheduledHolds(supabase())).toEqual({ placed: 1, declined: 0 });
    expect(squareCalls[0].body).toMatchObject({ autocomplete: false, amount_money: { amount: 8558 }, idempotency_key: `hold_${ORDER_ID.replace(/-/g, '')}` });
    expect(writes).toContainEqual(
      expect.objectContaining({
        table: 'orders',
        op: 'update',
        values: expect.objectContaining({ hold_payment_id: 'HOLD_9', hold_status: 'held', payment_status: 'authorized' }),
        filters: expect.objectContaining({ hold_status: 'scheduled' }),
      })
    );
  });

  it('asks the customer for a new card when the hold is declined', async () => {
    selectRows.orders = [scheduled];
    stubSquare({ '/payments': { status: 402, body: { errors: [{ detail: 'Card declined.' }] } } });
    expect(await placeScheduledHolds(supabase())).toEqual({ placed: 0, declined: 1 });
    expect(writes).toContainEqual(expect.objectContaining({ table: 'orders', values: expect.objectContaining({ hold_status: 'declined' }) }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ customTitle: '💳 New card needed before pickup', customMessage: expect.stringContaining(`/track/${ORDER_ID}`) })
    );
    expect(reportError).toHaveBeenCalledWith('daily-job/hold-declined', 'Card declined.', expect.objectContaining({ alert: true }));
  });

  // Client 2026-10-08: "No charge until we confirm"
  it('a Zone 5 pickup gets its hold only once its run is confirmed', async () => {
    const zone5 = { ...scheduled, extended_reach_band: 'A', pickup_date: '2026-10-21' };
    selectRows.orders = [zone5];
    stubSquare({ '/payments': { status: 200, body: { payment: { id: 'HOLD_5', status: 'APPROVED', delayed_until: '2026-10-28T14:00:00Z' } } } });
    expect(await placeScheduledHolds(supabase())).toEqual({ placed: 0, declined: 0 });
    expect(squareCalls).toEqual([]);
    selectRows.route_cycles = [{ run_date: '2026-10-21', band: 'A' }];
    expect(await placeScheduledHolds(supabase())).toEqual({ placed: 1, declined: 0 });
  });

  it('does nothing without Square configured', async () => {
    delete process.env.SQUARE_ACCESS_TOKEN;
    selectRows.orders = [scheduled];
    expect(await placeScheduledHolds(supabase())).toEqual({ placed: 0, declined: 0 });
  });

  it('marks holds Square let expire', async () => {
    selectRows['orders:update'] = [{ id: 'a' }, { id: 'b' }];
    expect(await markExpiredHolds(supabase())).toBe(2);
    expect(writes[0].values).toMatchObject({ hold_status: 'expired' });
  });
});

describe('Payment Needed ladder', () => {
  const now = new Date('2026-10-10T14:00:00Z');
  const needed = (hoursAgo: number, stage: number) => ({
    id: ORDER_ID,
    order_number: 'F11-2026-OWED',
    total: 130.25,
    amount_due: 34.25,
    payment_needed_since: new Date(now.getTime() - hoursAgo * 3600 * 1000).toISOString(),
    payment_reminder_stage: stage,
    customer: { full_name: 'Ada Lovelace', phone: '+12145550100', email: 'ada@example.com' },
  });
  const stageWrite = () => writes.find((w) => w.table === 'orders' && 'payment_reminder_stage' in w.values)?.values.payment_reminder_stage;

  it('waits for the first 24 hours', async () => {
    selectRows.orders = [needed(23, 0)];
    expect(await runPaymentNeededLadder(supabase(), now)).toEqual({ reminded: 0, callsDue: 0, ownerFlagged: 0 });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('reminds the customer after 24 hours, with the amount still owed', async () => {
    selectRows.orders = [needed(25, 0)];
    expect((await runPaymentNeededLadder(supabase(), now)).reminded).toBe(1);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ customMessage: expect.stringContaining('$34.25') }));
    expect(stageWrite()).toBe(1);
  });

  it('puts the order on the staff call list after 48 hours', async () => {
    selectRows.orders = [needed(49, 1)];
    expect((await runPaymentNeededLadder(supabase(), now)).callsDue).toBe(1);
    expect(reportError).toHaveBeenCalledWith('daily-job/payment-call', expect.any(String), expect.objectContaining({ alert: true }));
    expect(stageWrite()).toBe(2);
  });

  it('flags the order for an owner decision after 7 days', async () => {
    selectRows.orders = [needed(7 * 24 + 1, 2)];
    expect((await runPaymentNeededLadder(supabase(), now)).ownerFlagged).toBe(1);
    expect(reportError).toHaveBeenCalledWith('daily-job/payment-owner', expect.any(String), expect.objectContaining({ alert: true }));
    expect(stageWrite()).toBe(3);
  });

  it('moves at most one step per run', async () => {
    selectRows.orders = [needed(10 * 24, 0)];
    await runPaymentNeededLadder(supabase(), now);
    expect(stageWrite()).toBe(1);
  });
});

describe('Daily job route', () => {
  const call = (auth?: string) =>
    cronGET(new Request('http://localhost/api/cron/daily', { headers: auth ? { authorization: auth } : {} }));

  it('refuses callers without the secret, and runs nothing when the secret is unset', async () => {
    process.env.CRON_SECRET = 'a-very-long-random-cron-secret-1234';
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await call('Bearer ')).status).toBe(401);
  });

  it('runs with the secret', async () => {
    process.env.CRON_SECRET = 'a-very-long-random-cron-secret-1234';
    stubSquare({});
    const res = await call('Bearer a-very-long-random-cron-secret-1234');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, holds: { placed: 0, declined: 0 } });
  });

  it('is scheduled daily in vercel.json', () => {
    const vercel = JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8'));
    expect(vercel.crons).toEqual([
      { path: '/api/cron/daily', schedule: '0 14 * * *' },
      // Client 2026-10-08: Zone 5 routes are confirmed Monday by 6 PM (5 PM Dallas in summer, 4 PM in winter)
      { path: '/api/cron/route-check', schedule: '0 22 * * *' },
    ]);
  });

  it('the evening route check needs the secret too', async () => {
    process.env.CRON_SECRET = 'a-very-long-random-cron-secret-1234';
    const check = (auth?: string) => routeCheckGET(new Request('http://localhost/api/cron/route-check', { headers: auth ? { authorization: auth } : {} }));
    expect((await check('Bearer wrong')).status).toBe(401);
    stubSquare({});
    const res = await check('Bearer a-very-long-random-cron-secret-1234');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, routes: { dispatched: 0, rolled: 0 } });
  });
});

describe('New card before pickup (hold declined)', () => {
  const post = (body: unknown) =>
    holdCardPOST(
      new Request(`http://localhost/api/orders/${ORDER_ID}/hold-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 200)}` },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: ORDER_ID }) }
    );

  it('saves the new card and places the hold on it', async () => {
    singleRow = {
      orders: { id: ORDER_ID, order_number: 'F11-2026-SCHED', status: 'booked', hold_status: 'declined', hold_amount: 85.58, customer_id: 'cust-1', square_customer_id: 'SQ_CUST' },
      customers: { id: 'cust-1', full_name: 'Ada Lovelace', email: 'ada@example.com', square_customer_id: 'SQ_CUST' },
    };
    stubSquare({
      '/cards': { status: 200, body: { card: { id: 'ccof:NEW' } } },
      '/payments': { status: 200, body: { payment: { id: 'HOLD_NEW', status: 'APPROVED' } } },
    });
    const res = await post({ card_token: 'cnon:new-card' });
    expect(res.status).toBe(200);
    expect(squareCalls.find((c) => c.path === '/payments')?.body).toMatchObject({ source_id: 'ccof:NEW', autocomplete: false, amount_money: { amount: 8558 } });
    expect(writes).toContainEqual(
      expect.objectContaining({ table: 'orders', values: expect.objectContaining({ square_card_id: 'ccof:NEW', hold_payment_id: 'HOLD_NEW', hold_status: 'held' }) })
    );
  });

  it('refuses orders that do not need a new card', async () => {
    singleRow = { orders: { id: ORDER_ID, status: 'booked', hold_status: 'held' } };
    stubSquare({});
    expect((await post({ card_token: 'cnon:new-card' })).status).toBe(409);
    expect(squareCalls).toHaveLength(0);
  });
});
