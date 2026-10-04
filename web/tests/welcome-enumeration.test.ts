import { describe, it, expect, vi, beforeEach } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: { customer: null as null | { id: string; email: string; created_at: string }, sent: 0 },
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 4 }),
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/supabase/auth-helpers', () => ({ getAuthenticatedCustomer: async () => ({ user: null, customer: null }) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const b = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: state.customer, error: null }) };
    return { from: () => b };
  },
}));
vi.mock('@/lib/resend', () => ({
  buildWelcomeEmailHtml: () => '<p>hi</p>',
  sendEmail: async () => {
    state.sent++;
    return { success: true, id: 'msg-1' };
  },
}));

import { POST } from '@/app/api/auth/welcome/route';

function welcome(email: string) {
  return POST(
    new Request('http://localhost/api/auth/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Person', email }),
    })
  );
}

describe('Welcome email endpoint does not reveal who has an account (SEC-18)', () => {
  beforeEach(() => {
    state.customer = null;
    state.sent = 0;
  });

  it('answers identically for unknown, existing-but-ineligible and eligible emails', async () => {
    const unknown = await welcome('nobody@example.com');

    state.customer = { id: 'c1', email: 'old@example.com', created_at: '2025-01-01T00:00:00Z' };
    const ineligible = await welcome('old@example.com');

    state.customer = { id: 'c2', email: 'new@example.com', created_at: new Date().toISOString() };
    const eligible = await welcome('new@example.com');

    const bodies = await Promise.all([unknown, ineligible, eligible].map((r) => r.json()));
    expect([unknown.status, ineligible.status, eligible.status]).toEqual([202, 202, 202]);
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
    expect(state.sent).toBe(1); // only the eligible request sends an email
  });
});
