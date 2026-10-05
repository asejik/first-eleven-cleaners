import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-15: each order stores the tax and fee it was charged, and the ledger
// counts only money actually collected.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
let ledgerOrders: Row[] = [];

function builder() {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    gte: () => b,
    lt: () => b,
    lte: () => b,
    limit: () => b,
    order: () => b,
    range: () => b,
    then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: ledgerOrders, count: ledgerOrders.length, error: null }).then(resolve),
  };
  return b;
}
// Totals are computed in SQL (order_financial_summary, verified in supabase/tests/dashboard_summaries.sql)
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => builder(),
    rpc: async () => ({
      data: { gross_revenue: 190, refunded_total: 60, net_revenue: 130, in_vault: 75, sales_tax_collected: 23.67 },
      error: null,
    }),
  }),
}));
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: { id: 'admin-1', role: 'admin' }, user: {} }),
}));

import { GET as financialsGET } from '@/app/api/mission-control/financials/route';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const o = (overrides: Row): Row => ({
  id: crypto.randomUUID(),
  order_number: 'F11-X',
  status: 'delivered',
  total: 100,
  refunded_amount: 0,
  payment_id: 'PAY',
  payment_status: 'charged',
  sales_tax: 7.89,
  environmental_fee: 2.83,
  events: [],
  items: [],
  ...overrides,
});

beforeEach(() => {
  ledgerOrders = [];
});

describe('Financial ledger counts only collected money (PR-15)', () => {
  it('returns the SQL totals and real payment IDs only', async () => {
    ledgerOrders = [
      o({ total: 100 }),
      o({ total: 75, payment_status: 'authorized', payment_id: null, status: 'booked' }),
    ];
    const { summary, transactions } = await (await financialsGET(new Request('http://localhost/api/mission-control/financials'))).json();
    expect(summary).toMatchObject({ gross_revenue: 190, refunded_total: 60, net_revenue: 130, in_vault: 75 });
    expect(transactions.map((t: { payment_id: string | null }) => t.payment_id)).toEqual(['PAY', null]);
  });
});

describe('Orders store the tax and fee they were charged (PR-15)', () => {
  const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
  it('booking and intake write sales_tax, environmental_fee and express_surcharge', () => {
    for (const file of ['src/app/api/bookings/route.ts', 'src/app/api/intake/route.ts']) {
      const code = src(file);
      expect(code, file).toContain('sales_tax:');
      expect(code, file).toContain('environmental_fee:');
      expect(code, file).toContain('express_surcharge:');
    }
  });
});
