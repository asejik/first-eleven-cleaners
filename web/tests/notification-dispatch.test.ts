import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P05 AR-01: Mission Control must not send real customers test status messages,
// and the manual dispatch API must not let any staff login send any status for
// any order. Only an admin may re-send the message for the order's current status.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

let orderFixture: Row | null = null;
function builder() {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    maybeSingle: async () => ({ data: orderFixture, error: null }),
  };
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder() }) }));

let role = 'admin';
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async (allowed: string[]) =>
    allowed.includes(role)
      ? { customer: { id: 'staff-1', role }, user: { id: 'staff-1' } }
      : { errorResponse: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) },
}));

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn(async () => ({ sms: { success: true } })) }));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: dispatch } }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true }),
  getClientIp: () => '127.0.0.1',
}));

import { POST } from '@/app/api/notifications/route';

const ORDER_ID = '11111111-2222-3333-4444-555555555555';
const post = (body: Row) =>
  POST(new Request('http://localhost/api/notifications', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  role = 'admin';
  dispatch.mockClear();
  orderFixture = {
    id: ORDER_ID,
    order_number: 'F11-2026-MSG00001',
    status: 'in_cleaning',
    customer: { id: 'c1', full_name: 'Pat Doe', phone: '+12145550100' },
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Manual status messages (AR-01)', () => {
  it('drivers and intake staff cannot send status messages', async () => {
    for (const r of ['driver', 'intake_staff']) {
      role = r;
      const res = await post({ order_id: ORDER_ID, stage: 'in_cleaning' });
      expect(res.status).toBe(403);
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('an admin cannot send a message for a stage the order is not in', async () => {
    const res = await post({ order_id: ORDER_ID, stage: 'delivered' });
    expect(res.status).toBe(409);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('an unknown stage is refused', async () => {
    const res = await post({ order_id: ORDER_ID, stage: 'teleported' });
    expect(res.status).toBe(400);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("an admin can re-send the order's current status message", async () => {
    const res = await post({ order_id: ORDER_ID, stage: 'in_cleaning' });
    expect(res.status).toBe(200);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('Mission Control has no test control that messages a real order', () => {
    const panel = src('src/components/mission-control/NotificationSimulator.tsx');
    expect(panel).not.toContain('Test SMS/WhatsApp');
    expect(panel).not.toContain('onManualTestNotification');
    expect(panel).not.toMatch(/Simulator HUD/i);
    const page = src('src/app/mission-control/page.tsx');
    expect(page).not.toContain('handleManualTestNotification');
  });

  it('the test email links to the real site, not localhost', () => {
    expect(src('src/app/api/notifications/test-email/route.ts')).not.toContain('http://localhost:3000');
  });
});
