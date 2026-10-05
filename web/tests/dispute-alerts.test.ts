import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-30: a card dispute (chargeback) alerts an admin; Square gives only a few
// days to respond.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const inserts: { table: string; row: Row }[] = [];
let existingEvent: Row | null = null;

function builder(table: string) {
  const b: Record<string, unknown> = {
    select: () => b,
    insert: async (row: Row) => {
      inserts.push({ table, row });
      return { error: null };
    },
    eq: () => b,
    ilike: () => b,
    maybeSingle: async () => ({
      data: table === 'orders' ? { id: 'order-1', order_number: 'F11-2026-DISP0001', status: 'delivered' } : existingEvent,
      error: null,
    }),
  };
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 99 }),
  getClientIp: () => '127.0.0.1',
}));
const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock('@/lib/error-reporting', () => ({ reportError }));

import { POST } from '@/app/api/payments/webhook/route';

const dispute = (state: string) =>
  POST(
    new Request('http://localhost/api/payments/webhook', {
      method: 'POST',
      body: JSON.stringify({
        type: 'dispute.created',
        data: { object: { dispute: { id: 'DP_1', payment_id: 'PAY_1', state, amount_money: { amount: 5683 } } } },
      }),
    })
  );

beforeEach(() => {
  inserts.length = 0;
  existingEvent = null;
  reportError.mockClear();
  delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
});

describe('Dispute alerts (PR-30)', () => {
  it('a new dispute emails an admin and is clearly marked on the order timeline', async () => {
    expect((await dispute('EVIDENCE_REQUIRED')).status).toBe(200);
    expect(reportError).toHaveBeenCalledWith(
      'payments/dispute/DP_1',
      expect.stringContaining('F11-2026-DISP0001'),
      expect.objectContaining({ alert: true })
    );
    const note = String(inserts.find((i) => i.table === 'order_events')?.row.note);
    expect(note).toMatch(/DISPUTE/);
    expect(note).toContain('$56.83');
  });

  it('a repeated event for the same dispute state does not alert again', async () => {
    existingEvent = { id: 'ev-1' };
    await dispute('EVIDENCE_REQUIRED');
    expect(reportError).not.toHaveBeenCalled();
  });
});
