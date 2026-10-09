import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fakeRpc } from './helpers/fake-create-booking';

// ---------------------------------------------------------------------------
// Client 2026-10-08, Part 2 item 3: "the plan discount applies to everything
// except alterations and fees. Weekly = 10% off, Bi-weekly = 5% off. So wash &
// fold is $2.70/lb Weekly and $2.85/lb Bi-weekly. The 15-lb floor stays. Zone 1
// member minimum is 15 lb x member rate: $40.50 Weekly / $42.75 Bi-weekly.
// Zones 2-5, the published zone minimum applies to members as-is." Promo codes
// don't combine with member pricing (recommended option).
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const { state } = vi.hoisted(() => ({
  state: { writes: [] as { table: string; op: string; values: Row }[], membership: null as Row | null, signedIn: false },
}));

function builder(table: string) {
  let op = 'select';
  let values: Row = {};
  let isCount = false;
  const result = () => {
    if (isCount) return { count: 0, error: null };
    if (op === 'insert') return { data: { id: `${table}-new-id`, ...values }, error: null };
    if (op === 'update') return { data: [], error: null };
    if (table === 'routine_memberships') return { data: state.membership, error: null };
    if (table === 'customers') return { data: { id: 'cust-1', auth_id: state.signedIn ? 'auth-1' : null }, error: null };
    return { data: null, error: null };
  };
  const record = (o: string, v: Row) => ((op = o), (values = v), state.writes.push({ table, op: o, values: v }));
  const b: Record<string, unknown> = {
    select: (_c?: string, opts?: { head?: boolean }) => ((isCount = Boolean(opts?.head) || isCount), b),
    insert: (v: Row) => (record('insert', v), b),
    update: (v: Row) => (record('update', v), b),
    eq: () => b,
    neq: () => b,
    gte: () => b,
    ilike: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: async () => result(),
    single: async () => result(),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return b;
}
const rpc = fakeRpc(builder);
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t), rpc: (fn: string, args: Row) => rpc(fn, args), auth: { admin: { createUser: async () => ({ data: {}, error: null }) } } }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.signedIn ? { id: 'auth-1', email: 'rita@example.com' } : null } }) } }),
}));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: async () => ({ success: true }) } }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));

import {
  calculateOrderFinancials,
  computeBookingFinancials,
  memberWashFoldRate,
  memberZoneMinimum,
  orderMinimumGap,
  ZONE_CONFIG,
  MEMBER_PROMO_NOT_COMBINED,
} from '@/lib/constants';
import { POST } from '@/app/api/bookings/route';
import { chatPriceList } from '@/lib/ai/price-list';
import { buildLlmsTxt } from '@/lib/llms';

describe('Routine member prices', () => {
  it('wash & fold is $2.70/lb Weekly and $2.85/lb Bi-Weekly', () => {
    expect(memberWashFoldRate('weekly')).toBe(2.7);
    expect(memberWashFoldRate('biweekly')).toBe(2.85);
    expect(memberWashFoldRate('one_time')).toBe(3);
  });

  it('the 15-lb floor stays: 15 lb Weekly is $40.50, Bi-Weekly $42.75', () => {
    expect(computeBookingFinancials({ weightLbs: 10, frequency: 'weekly' }).financials.netSubtotal).toBe(40.5);
    expect(computeBookingFinancials({ weightLbs: 15, frequency: 'biweekly' }).financials.netSubtotal).toBe(42.75);
  });

  it('the plan discount covers everything except alterations and fees', () => {
    const order = computeBookingFinancials({
      dryCleanItems: [{ garment_type: 'dress_shirt', quantity: 10 }],
      alterationItems: [{ garment_type: 'hem_plain', quantity: 1, notes: 'x' }],
      frequency: 'weekly',
      extendedReachFee: 17.5,
    });
    const cleaning = order.subtotal - order.alterationSubtotal;
    expect(order.alterationSubtotal).toBeGreaterThan(0);
    expect(order.financials.frequencyDiscount).toBe(Math.round(cleaning * 10) / 100);
    // The Zone 5 fee is never discounted; the environmental fee and tax still apply
    expect(order.financials.extendedReachFee).toBe(17.5);
    expect(order.financials.environmentalFee).toBeGreaterThan(0);
  });

  it('without alterations it is a straight 10% / 5% off the subtotal', () => {
    expect(calculateOrderFinancials({ subtotal: 100, frequency: 'weekly' }).frequencyDiscount).toBe(10);
    expect(calculateOrderFinancials({ subtotal: 100, frequency: 'biweekly', alterationSubtotal: 40 }).frequencyDiscount).toBe(3);
  });
});

describe('Member minimums', () => {
  it('Zone 1 members: 15 lb at their rate ($40.50 / $42.75); Zones 2-5 as published', () => {
    expect(memberZoneMinimum(ZONE_CONFIG.zone_1, 'weekly')).toBe(40.5);
    expect(memberZoneMinimum(ZONE_CONFIG.zone_1, 'biweekly')).toBe(42.75);
    expect(memberZoneMinimum(ZONE_CONFIG.zone_1, 'one_time')).toBe(45);
    expect(memberZoneMinimum(ZONE_CONFIG.zone_2, 'weekly')).toBe(60);
  });

  it('a Zone 1 member is measured at member prices; Zone 2 members as before', () => {
    // $41 of dry cleaning: one-time $4 short of $45; Weekly $36.90 is $3.60 short of $40.50
    expect(orderMinimumGap(41, ZONE_CONFIG.zone_1, 'one_time')).toBe(4);
    expect(orderMinimumGap(41, ZONE_CONFIG.zone_1, 'weekly')).toBe(3.6);
    expect(orderMinimumGap(45, ZONE_CONFIG.zone_1, 'weekly')).toBe(0);
    expect(orderMinimumGap(59, ZONE_CONFIG.zone_2, 'weekly')).toBe(1);
  });
});

describe('Booking', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    state.writes = [];
    state.membership = null;
    state.signedIn = false;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
    delete process.env.SQUARE_ACCESS_TOKEN;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  const nextMonday = () => {
    const todayTx = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
    const d = new Date(`${todayTx}T12:00:00`);
    d.setDate(d.getDate() + 2);
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
    return d.toISOString().split('T')[0];
  };
  const book = (extra: Row = {}, lbs = 15) =>
    POST(
      new Request('http://localhost/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: { full_name: 'Rita Routine', email: 'rita@example.com', phone: '2145550100' },
          address: { street: '100 Test St', city: 'Plano', state: 'TX', zip: '75024' },
          services: { type: 'wash_fold', dry_clean_items: [], estimated_weight_lbs: lbs },
          schedule: { pickup_date: nextMonday(), pickup_window: 'morning', express_tier: 'standard', frequency: 'one_time' },
          consents: { payment_terms: true },
          ...extra,
        }),
      })
    );
  const savedOrder = () => (state.writes.find((w) => w.table === 'orders' && w.op === 'insert')?.values ?? {}) as Row;

  it("a signed-in member's extra pickup is priced at their plan", async () => {
    state.signedIn = true;
    state.membership = { id: 'm-1', cadence: 'weekly', status: 'active' };
    const res = await book();
    expect(res.status).toBe(200);
    expect(savedOrder()).toMatchObject({ frequency: 'weekly', discount_amount: 4.5 });
    expect(state.writes.some((w) => w.table === 'routine_memberships' && w.op === 'insert')).toBe(false);
  });

  it('a paused member keeps member pricing; a guest pays the regular price', async () => {
    state.signedIn = true;
    state.membership = { id: 'm-1', cadence: 'biweekly', status: 'paused' };
    await book();
    expect(savedOrder()).toMatchObject({ frequency: 'biweekly', discount_amount: 2.25 });
    state.writes = [];
    state.signedIn = false;
    state.membership = null;
    await book();
    expect(savedOrder()).toMatchObject({ frequency: 'one_time', discount_amount: 0 });
  });

  it("promo codes don't combine with member pricing", async () => {
    state.signedIn = true;
    state.membership = { id: 'm-1', cadence: 'weekly', status: 'active' };
    const res = await book({ pricing: { subtotal: 0, total: 0, promo_code: 'KICKOFF15' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: MEMBER_PROMO_NOT_COMBINED, code: 'PROMO_NOT_COMBINED' });
    state.signedIn = false;
    state.membership = null;
    const joining = await book({
      pricing: { subtotal: 0, total: 0, promo_code: 'KICKOFF15' },
      schedule: { pickup_date: nextMonday(), pickup_window: 'morning', express_tier: 'standard', frequency: 'weekly' },
      consents: { payment_terms: true, routine_terms: true },
    });
    expect(joining.status).toBe(400);
  });
});

describe('Where the prices are shown', () => {
  it('Eleven, llms.txt and the pricing page give the member rates', () => {
    expect(chatPriceList()).toContain('wash & fold $2.70/lb Weekly, $2.85/lb Bi-Weekly');
    expect(chatPriceList()).toContain('Zone 1 member minimum: $40.50 Weekly / $42.75 Bi-Weekly');
    expect(buildLlmsTxt()).toContain('Weekly 10% off, Bi-Weekly 5% off everything except alterations and fees');
    const page = readFileSync(join(__dirname, '..', 'src', 'app', 'pricing', 'page.tsx'), 'utf8');
    expect(page).toContain("memberWashFoldRate('weekly')");
    expect(page).toContain("memberZoneMinimum(ZONE_CONFIG.zone_1, 'biweekly')");
  });
});
