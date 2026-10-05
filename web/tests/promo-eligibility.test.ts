import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P05 AR-02: the promo box must give the same answer the booking will. A code a
// customer has already used (e.g. the first-order KICKOFF15) is refused up front,
// before the card step, and the review quotes fixed-dollar codes in dollars.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const { state } = vi.hoisted(() => ({
  state: {
    promoRows: {} as Record<string, Row>,
    customerByEmail: null as Row | null,
    customerByAuth: null as Row | null,
    authUser: null as Row | null,
    priorUses: 0,
  },
}));

function builder(table: string) {
  const filters: Row = {};
  let isCount = false;
  const result = () => {
    if (isCount) return { count: table === 'orders' ? state.priorUses : 0, error: null };
    if (table === 'promo_codes') return { data: state.promoRows[String(filters.code)] ?? null, error: null };
    if (table === 'customers') return { data: 'auth_id' in filters ? state.customerByAuth : state.customerByEmail, error: null };
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {
    select: (_c?: string, opts?: { head?: boolean }) => {
      if (opts?.head) isCount = true;
      return b;
    },
    eq: (k: string, v: unknown) => {
      filters[k] = v;
      return b;
    },
    neq: () => b,
    ilike: (k: string, v: unknown) => {
      filters[k] = v;
      return b;
    },
    maybeSingle: async () => result(),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.authUser } }) } }),
}));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true }),
  getClientIp: () => '127.0.0.1',
}));

import { POST } from '@/app/api/promo/validate/route';
import { promoFinancialInputs } from '@/lib/promo';

const originalEnv = { ...process.env };
const validate = async (body: Row) => {
  const res = await POST(new Request('http://localhost/api/promo/validate', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
  state.promoRows = {
    KICKOFF15: { id: 'p1', code: 'KICKOFF15', discount_type: 'percentage', discount_value: 15, max_uses: 10000, current_uses: 6, valid_from: null, valid_until: null, is_active: true },
    WELCOME5: { id: 'p2', code: 'WELCOME5', discount_type: 'fixed', discount_value: 5, max_uses: 2000, current_uses: 0, valid_from: null, valid_until: null, is_active: true },
  };
  state.customerByEmail = null;
  state.customerByAuth = null;
  state.authUser = null;
  state.priorUses = 0;
});
afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Promo eligibility is checked before the card step (AR-02)', () => {
  it('a returning guest who already used KICKOFF15 is told up front', async () => {
    state.customerByEmail = { id: 'guest-1', auth_id: null };
    state.priorUses = 1;
    const { body } = await validate({ code: 'kickoff15', email: 'pat@example.com' });
    expect(body.valid).toBe(false);
    expect(body.already_used).toBe(true);
    expect(body.message).toMatch(/first order/i);
  });

  it('a signed-in customer who already used the code is told up front', async () => {
    state.authUser = { id: 'auth-1' };
    state.customerByAuth = { id: 'cust-1' };
    state.priorUses = 1;
    const { body } = await validate({ code: 'WELCOME5' });
    expect(body.valid).toBe(false);
    expect(body.already_used).toBe(true);
  });

  it('a first-time customer still gets the code', async () => {
    const { body } = await validate({ code: 'KICKOFF15', email: 'new@example.com' });
    expect(body.valid).toBe(true);
    expect(body.discount_type).toBe('percentage');
  });

  it('MATCHREADY is no longer a built-in code', async () => {
    const { body } = await validate({ code: 'MATCHREADY' });
    expect(body.valid).toBe(false);
  });
});

describe('Review step quotes the discount the server will apply (AR-02)', () => {
  it('a fixed-dollar code is a dollar amount, not a percentage', () => {
    expect(promoFinancialInputs({ code: 'WELCOME5', discount_type: 'fixed', discount_value: 5 })).toEqual({ discountPercent: 0, discountAmount: 5 });
  });

  it('a percentage code is a percentage', () => {
    expect(promoFinancialInputs({ code: 'KICKOFF15', discount_type: 'percentage', discount_value: 15 })).toEqual({ discountPercent: 15, discountAmount: undefined });
    expect(promoFinancialInputs(null)).toEqual({ discountPercent: 0, discountAmount: undefined });
  });

  it('the booking flow re-checks the applied code with the customer email on the review step', () => {
    const hook = readFileSync(join(__dirname, '..', 'src/hooks/useBookingState.ts'), 'utf8');
    expect(hook).toMatch(/step [!=]== 4/);
    expect(hook).toMatch(/recheckPromo|checkAppliedPromo/);
  });
});
