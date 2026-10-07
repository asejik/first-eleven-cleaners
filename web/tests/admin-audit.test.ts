import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-24: admin actions that change orders or money are written to
// admin_audit_logs with who did it.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const inserts: { table: string; row: Row }[] = [];
let orderFixture: Row | null = null;

function builder(table: string) {
  const filters: Row = {};
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (row: Row) => {
      inserts.push({ table, row });
      return Promise.resolve({ error: null });
    },
    update: () => b,
    eq: (k: string, v: unknown) => {
      filters[k] = v;
      return b;
    },
    or: () => b,
    // "Is this Square payment already on another order?" finds nothing
    maybeSingle: async () => ({ data: table === 'orders' && !('payment_id' in filters) ? orderFixture : null, error: null }),
    single: async () => ({ data: { id: 'x' }, error: null }),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: [{ id: 'o1' }], error: null }).then(resolve),
  };
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }));
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({
    customer: { id: 'admin-uuid-1', full_name: 'Ops Admin', email: 'ops@example.com', role: 'admin' },
    user: { id: 'auth-1' },
  }),
}));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: vi.fn(async () => ({})) } }));
vi.mock('@/lib/storage', () => ({ withSignedPhotoUrls: async <T,>(v: T) => v }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '203.0.113.7',
}));

import { POST } from '@/app/api/mission-control/route';

const ORDER_ID = '11111111-2222-3333-4444-555555555555';
const mc = (body: Row) =>
  POST(new Request('http://localhost/api/mission-control', { method: 'POST', body: JSON.stringify({ order_id: ORDER_ID, ...body }) }));
const audits = () => inserts.filter((i) => i.table === 'admin_audit_logs').map((i) => i.row);

beforeEach(() => {
  inserts.length = 0;
  orderFixture = { id: ORDER_ID, order_number: 'F11-2026-AUD00001', status: 'weighed_itemized', payment_status: 'failed', total: 50, customer: {} };
});

describe('Admin audit trail (PR-24)', () => {
  it('a stage change records the admin, the move and any override', async () => {
    // Delivery is the stage that waits for payment (client 2026-10-06, Part A)
    orderFixture = { ...orderFixture, status: 'in_cleaning' };
    const res = await mc({ action: 'advance_stage', new_stage: 'out_for_delivery', manager_override: true, override_reason: 'Paid by phone' });
    expect(res.status).toBe(200);
    expect(audits()).toHaveLength(1);
    expect(audits()[0]).toMatchObject({
      admin_id: 'admin-uuid-1',
      admin_email: 'ops@example.com',
      action: 'order.stage_change',
      target_type: 'order',
      target_id: ORDER_ID,
      ip_address: '203.0.113.7',
    });
    expect(audits()[0].details).toMatchObject({ from: 'in_cleaning', to: 'out_for_delivery', manager_override: true, override_reason: 'Paid by phone' });
  });

  it('a refused action records nothing', async () => {
    orderFixture = { ...orderFixture, status: 'picked_up' };
    await mc({ action: 'advance_stage', new_stage: 'weighed_itemized' });
    expect(audits()).toHaveLength(0);
  });

  it('marking a held order paid is audited', async () => {
    await mc({ action: 'mark_paid_external', square_payment_id: 'PAY_PHONE_123' });
    expect(audits().map((a) => a.action)).toContain('payment.mark_paid_external');
  });
});
