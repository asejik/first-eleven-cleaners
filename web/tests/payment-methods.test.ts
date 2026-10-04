import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: {
    squareCustomerId: 'SQ_CUST' as string | null,
    pendingOrdersForCard: 0,
    squareCalls: [] as { method: string; path: string }[],
  },
}));

vi.mock('@/lib/supabase/auth-helpers', () => ({
  getAuthenticatedCustomer: async () => ({ customer: { id: 'cust-1', role: 'customer' }, user: { id: 'u1' } }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let isCount = false;
      const b: Record<string, unknown> = {
        select: (_c?: string, opts?: { head?: boolean }) => {
          if (opts?.head) isCount = true;
          return b;
        },
        eq: () => b,
        in: () => b,
        neq: () => b,
        order: () => b,
        maybeSingle: async () => ({ data: table === 'customers' ? { square_customer_id: state.squareCustomerId } : null, error: null }),
        then: (resolve: (r: unknown) => unknown) =>
          Promise.resolve(isCount ? { count: state.pendingOrdersForCard, error: null } : { data: [], error: null }).then(resolve),
      };
      return b;
    },
  }),
}));

import { GET, POST, DELETE } from '@/app/api/customer/payment-methods/route';

const originalEnv = { ...process.env };

function stubSquareCards(cards: unknown[]) {
  state.squareCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      state.squareCalls.push({ method: init?.method || 'GET', path: url.pathname.replace('/v2', '') + url.search });
      if (url.pathname.endsWith('/disable')) {
        return new Response(JSON.stringify({ card: { id: 'ccof:A', enabled: false } }), { status: 200 });
      }
      return new Response(JSON.stringify({ cards }), { status: 200 });
    })
  );
}

const SAVED = [
  { id: 'ccof:A', card_brand: 'VISA', last_4: '5858', exp_month: 12, exp_year: 2029, enabled: true, fingerprint: 'fp-visa' },
  { id: 'ccof:A2', card_brand: 'VISA', last_4: '5858', exp_month: 12, exp_year: 2029, enabled: true, fingerprint: 'fp-visa' },
  { id: 'ccof:OLD', card_brand: 'MASTERCARD', last_4: '1111', exp_month: 1, exp_year: 2027, enabled: false },
];

describe('Billing shows real Square cards and never collects card numbers (SEC-21)', () => {
  beforeEach(() => {
    process.env.SQUARE_ACCESS_TOKEN = 'EAAAtest-sandbox-token';
    process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID = 'LOC123';
    process.env.SQUARE_ENVIRONMENT = 'sandbox';
    state.squareCustomerId = 'SQ_CUST';
    state.pendingOrdersForCard = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists only active cards, one entry per physical card', async () => {
    stubSquareCards(SAVED);
    const body = await (await GET(new Request('http://localhost/api/customer/payment-methods'))).json();
    expect(body.payment_methods).toEqual([{ id: 'ccof:A', brand: 'visa', last4: '5858', exp_month: 12, exp_year: 2029 }]);
  });

  it('shows no fake default card when the customer has none', async () => {
    state.squareCustomerId = null;
    stubSquareCards([]);
    const body = await (await GET(new Request('http://localhost/api/customer/payment-methods'))).json();
    expect(body.payment_methods).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('4242');
  });

  it('no longer accepts card details posted from our own form', async () => {
    const res = await POST();
    expect(res.status).toBe(410);
  });

  it('refuses to remove a card still needed by an uncharged order', async () => {
    stubSquareCards(SAVED);
    state.pendingOrdersForCard = 1;
    const res = await DELETE(new Request('http://localhost/api/customer/payment-methods?card_id=ccof:A', { method: 'DELETE' }));
    expect(res.status).toBe(409);
    expect(state.squareCalls.some((c) => c.path.includes('/disable'))).toBe(false);
  });

  it("refuses to remove a card that isn't the customer's", async () => {
    stubSquareCards(SAVED);
    const res = await DELETE(new Request('http://localhost/api/customer/payment-methods?card_id=ccof:SOMEONE_ELSE', { method: 'DELETE' }));
    expect(res.status).toBe(404);
  });

  it('disables the card with Square when it is free to remove', async () => {
    stubSquareCards(SAVED);
    const res = await DELETE(new Request('http://localhost/api/customer/payment-methods?card_id=ccof:A', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(state.squareCalls).toContainEqual({ method: 'POST', path: '/cards/ccof%3AA/disable' });
    // every saved copy of the same card is removed
    expect(state.squareCalls).toContainEqual({ method: 'POST', path: '/cards/ccof%3AA2/disable' });
  });
});
