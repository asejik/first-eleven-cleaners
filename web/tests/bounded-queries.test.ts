import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-14: dashboards never download every order. Lists are filtered and capped
// in SQL; totals come from SQL aggregate functions, so they stay correct past
// the API's 1,000-row limit.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Call = { table: string; select?: string; filters: Array<[string, unknown]>; limit?: number };
const calls: Call[] = [];
const rpcCalls: Array<{ fn: string; args: Row }> = [];
let rows: Row[] = [];
let rpcResult: unknown = {};

function builder(table: string) {
  const call: Call = { table, filters: [] };
  calls.push(call);
  const b: Record<string, unknown> = {
    select: (cols?: string) => {
      call.select = cols;
      return b;
    },
    eq: (k: string, v: unknown) => (call.filters.push([`eq:${k}`, v]), b),
    in: (k: string, v: unknown) => (call.filters.push([`in:${k}`, v]), b),
    gte: (k: string, v: unknown) => (call.filters.push([`gte:${k}`, v]), b),
    lt: (k: string, v: unknown) => (call.filters.push([`lt:${k}`, v]), b),
    order: () => b,
    range: (from: number, to: number) => ((call.limit = to - from + 1), b),
    limit: (n: number) => ((call.limit = n), b),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: rows, count: rows.length, error: null }).then(resolve),
  };
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => builder(t),
    rpc: async (fn: string, args: Row) => {
      rpcCalls.push({ fn, args });
      return { data: rpcResult, error: null };
    },
  }),
}));
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: { id: 'admin-1', role: 'admin' }, user: {} }),
}));
vi.mock('@/lib/storage', () => ({ withSignedPhotoUrls: async <T,>(v: T) => v }));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: vi.fn() } }));

import { GET as intakeGET } from '@/app/api/intake/route';
import { GET as financialsGET } from '@/app/api/mission-control/financials/route';
import { GET as missionControlGET } from '@/app/api/mission-control/route';
import { texasDate } from '@/lib/texas-time';

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  rows = [];
  rpcResult = {};
});

const orderCalls = () => calls.filter((c) => c.table === 'orders');

describe('Intake loads only what the station shows (PR-14)', () => {
  it('queue = picked-up bags; history = last 50; no all-orders download', async () => {
    const body = await (await intakeGET(new Request('http://localhost/api/intake'))).json();
    expect(body).not.toHaveProperty('allOrders');
    for (const c of orderCalls()) {
      expect(c.filters.some(([k]) => k === 'eq:status' || k === 'in:status'), JSON.stringify(c)).toBe(true);
    }
    const history = orderCalls().find((c) => c.filters.some(([k]) => k === 'in:status'));
    expect(history?.limit).toBe(50);
  });
});

describe('Financials totals come from SQL over a date range (PR-14)', () => {
  it('passes the range to the summary function and caps the transaction list', async () => {
    rpcResult = { gross_revenue: 12345.67, net_revenue: 12000, refunded_total: 345.67, in_vault: 10, sales_tax_collected: 900, environmental_fees_collected: 300, charged_count: 400, authorized_count: 3, failed_count: 1, refunded_count: 2, total_transactions: 1600, aov: 30.1 };
    const res = await financialsGET(new Request('http://localhost/api/mission-control/financials?from=2026-09-01&to=2026-09-30'));
    const body = await res.json();
    expect(rpcCalls[0].fn).toBe('order_financial_summary');
    expect(rpcCalls[0].args).toMatchObject({ p_from: '2026-09-01', p_to: '2026-09-30' });
    expect(body.summary.gross_revenue).toBe(12345.67);
    const list = orderCalls()[0];
    expect(list.limit).toBe(500);
    expect(list.filters.map(([k]) => k)).toEqual(expect.arrayContaining(['gte:created_at', 'lt:created_at']));
  });

  it('defaults to the last 90 days', async () => {
    await financialsGET(new Request('http://localhost/api/mission-control/financials'));
    expect(rpcCalls[0].args.p_to).toBe(texasDate());
  });
});

describe('Mission Control KPIs come from SQL (PR-14)', () => {
  it('asks SQL for today\'s figures in Dallas time instead of loading every order', async () => {
    rpcResult = { active_count: 7, total_count: 1500, today_sales: 412.5, active_lbs: 88, active_pieces: 41, net_revenue: 50210.4 };
    const body = await (await missionControlGET(new Request('http://localhost/api/mission-control'))).json();
    expect(rpcCalls[0]).toEqual({ fn: 'mission_control_summary', args: { p_today: texasDate() } });
    expect(body.stats).toMatchObject({ active_count: 7, today_revenue: 412.5, total_lbs: 88, total_pieces: 41, all_time_revenue: 50210.4 });
    // the only orders query is the paginated board list
    expect(orderCalls()).toHaveLength(1);
    expect(orderCalls()[0].limit).toBeLessThanOrEqual(100);
  });
});
