import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Client 2026-10-14, the order-two sequence: "the metric we live by: a customer who
// completes 2 orders in their first 21 days." One-tap rebook in the delivered text, a Day 6
// nudge, and the discount moved to order two: "First order: no promo. Order two within 21
// days: $10 off, automatic, no code." One-time customers only; member pricing replaces it.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
let idSeq = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}`;

function table(name: string) {
  type Filter = (r: Row) => boolean;
  const filters: Filter[] = [];
  let op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  let values: Row = {};
  let head = false;
  let conflict: string | null = null;
  let limit = Infinity;
  let sortBy: string | null = null;
  const rows = () => (db[name] ||= []);
  const matching = () => {
    const hit = rows().filter((r) => filters.every((f) => f(r)));
    if (sortBy) hit.sort((a, b) => String(a[sortBy!]).localeCompare(String(b[sortBy!])));
    return hit.slice(0, limit);
  };
  const unique: Record<string, string[]> = { referral_codes: ['customer_id', 'code'], customer_credits: [] };
  const run = (): { data: unknown; error: unknown; count?: number } => {
    if (op === 'insert') {
      for (const key of unique[name] || []) if (rows().some((r) => r[key] === values[key])) return { data: null, error: { code: '23505' } };
      if (name === 'customer_credits' && values.reason === 'referral_reward' && rows().some((r) => r.reason === 'referral_reward' && r.referral_id === values.referral_id)) {
        return { data: null, error: { code: '23505' } };
      }
      if (name === 'customer_credits' && values.reason === 'used' && rows().some((r) => r.reason === 'used' && r.order_id === values.order_id)) {
        return { data: null, error: { code: '23505' } };
      }
      const row = { id: nextId(), ...values };
      rows().push(row);
      return { data: row, error: null };
    }
    if (op === 'upsert') {
      const hit = conflict ? rows().find((r) => r[conflict!] === values[conflict!]) : undefined;
      if (hit) Object.assign(hit, values);
      else rows().push({ id: nextId(), ...values });
      return { data: null, error: null };
    }
    if (op === 'update') {
      const hit = matching();
      hit.forEach((r) => Object.assign(r, values));
      return { data: hit, error: null };
    }
    return head ? { data: null, count: matching().length, error: null } : { data: matching(), error: null };
  };
  const b: Record<string, unknown> = {
    select: (_c?: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), b),
    insert: (v: Row) => ((op = 'insert'), (values = v), b),
    update: (v: Row) => ((op = 'update'), (values = v), b),
    upsert: (v: Row, opts?: { onConflict?: string }) => ((op = 'upsert'), (values = v), (conflict = opts?.onConflict ?? null), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b),
    ilike: (c: string, v: string) => (filters.push((r) => String(r[c]).toLowerCase() === v.toLowerCase()), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
    not: () => b,
    gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), b),
    lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), b),
    order: (c: string) => ((sortBy = c), b),
    limit: (n: number) => ((limit = n), b),
    single: async () => {
      const r = run();
      return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data };
    },
    maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return b;
}
const admin = {
  from: table,
  rpc: async (fn: string, args: Row) => {
    if (fn !== 'create_booking') return { data: null, error: null };
    const order: Row = { id: nextId(), status: 'booked', ...((args.p as Row).order as Row) };
    (db.orders ||= []).push(order);
    return { data: { ok: true, replay: false, order: { id: order.id, order_number: order.order_number, total: order.total, status: 'booked', customer_id: order.customer_id } }, error: null };
  },
  auth: { admin: { createUser: async () => ({ data: {}, error: null }) } },
};
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
let signedInAuthId: string | null = null;
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: signedInAuthId ? { id: signedInAuthId } : null } }) } }),
}));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }), getClientIp: () => '127.0.0.1' }));
const dispatch = vi.fn(async (payload: unknown) => ({ success: Boolean(payload) }));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: (payload: unknown) => dispatch(payload) } }));
const contact = vi.fn(async () => ({ ok: true }));
vi.mock('@/lib/messaging/contact', () => ({ sendContactMessage: (...a: unknown[]) => contact(...(a as [])), sendSms: async () => ({ ok: true }) }));


import { isOrderTwo } from '@/lib/order-two';
import { rebookToken, readRebookToken, planRebook, bookRebook, rebookUrl } from '@/lib/rebook';
import { sendOrderTwoNudges } from '@/lib/order-two-nudge';
import { formatStageMessage } from '@/lib/messaging/templates';
import { DEFAULT_COVERAGE } from '@/lib/coverage';
import { POST as bookingPOST } from '@/app/api/bookings/route';
import { chatPriceList } from '@/lib/ai/price-list';

const supabase = admin as never;
const originalEnv = { ...process.env };
const todayTx = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const nextMonday = () => {
  const d = new Date(`${shift(todayTx(), 2)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
};

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.customers = [{ id: 'cust-1', email: 'dana@example.com', full_name: 'Dana Lee', phone: '+12145550100', role: 'customer', auth_id: null, sms_promotions_consent: false, order_two_nudged_at: null }];
  db.addresses = [{ id: 'addr-1', customer_id: 'cust-1', street: '9 Elm St', city: 'Plano', zip: '75024' }];
  signedInAuthId = null;
  contact.mockClear();
  dispatch.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
  delete process.env.SQUARE_ACCESS_TOKEN;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('Order two', () => {
  it('is the second pickup, within 21 days of the first', () => {
    expect(isOrderTwo(['2026-10-01'], '2026-10-22')).toBe(true);
    expect(isOrderTwo(['2026-10-01'], '2026-10-23')).toBe(false);
    expect(isOrderTwo([], '2026-10-05')).toBe(false);
    expect(isOrderTwo(['2026-10-01', '2026-10-08'], '2026-10-12')).toBe(false);
  });

  const book = (extra: Record<string, unknown> = {}) =>
    bookingPOST(
      new Request('http://localhost/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          customer: { full_name: 'Dana Lee', email: 'dana@example.com', phone: '2145550100' },
          address: { street: '9 Elm St', city: 'Plano', state: 'TX', zip: '75024' },
          services: { type: 'wash_fold', dry_clean_items: [], estimated_weight_lbs: 20 },
          schedule: { pickup_date: nextMonday(), pickup_window: 'morning', express_tier: 'standard', frequency: 'one_time' },
          pricing: { subtotal: 0, total: 0, promo_code: null },
          consents: { payment_terms: true },
          ...extra,
        }),
      })
    );

  it("a returning guest's second pickup within 21 days is $10 off, automatically", async () => {
    db.orders = [{ id: 'first', customer_id: 'cust-1', status: 'delivered', pickup_date: shift(todayTx(), -3) }];
    expect((await book()).status).toBe(200);
    // 20 lb wash & fold = $60, $10 off
    expect(db.orders[1]).toMatchObject({ discount_amount: 10, order_two_discount: 10, promo_code: null });
  });

  it('not after 21 days, and not when joining the Routine (member pricing replaces it)', async () => {
    db.orders = [{ id: 'first', customer_id: 'cust-1', status: 'delivered', pickup_date: shift(todayTx(), -30) }];
    await book();
    expect(db.orders[1]).toMatchObject({ discount_amount: 0 });

    db.orders = [{ id: 'first', customer_id: 'cust-1', status: 'delivered', pickup_date: shift(todayTx(), -3) }];
    await book({
      schedule: { pickup_date: nextMonday(), pickup_window: 'morning', express_tier: 'standard', frequency: 'weekly' },
      consents: { payment_terms: true, routine_terms: true },
    });
    // 10% of $60
    expect(db.orders[1]).toMatchObject({ discount_amount: 6 });
    expect(db.orders[1].order_two_discount ?? 0).toBe(0);
  });

  it('never with a promo code: the bigger one applies', async () => {
    db.orders = [{ id: 'first', customer_id: 'cust-1', status: 'delivered', pickup_date: shift(todayTx(), -3) }];
    db.promo_codes = [{ code: 'BIG25', discount_type: 'percentage', discount_value: 25, is_active: true, max_uses: null, current_uses: 0, valid_from: null, valid_until: null }];
    await book({ pricing: { subtotal: 0, total: 0, promo_code: 'BIG25' } });
    // 25% of $60 = $15 beats $10
    expect(db.orders[1]).toMatchObject({ discount_amount: 15, promo_code: 'BIG25' });
    expect(db.orders[1].order_two_discount ?? 0).toBe(0);
  });

  it('Eleven knows: no first-order code, $10 off order two', () => {
    expect(chatPriceList()).toContain('second pickup within 21 days of their first is $10 off');
  });
});

describe('One-tap rebook', () => {
  const NOW = new Date('2026-10-16T15:00:00Z'); // Friday, October 16
  const ID = '11111111-2222-4333-8444-555555555555';
  const lastOrder = (over: Record<string, unknown> = {}) => ({
    id: ID,
    customer_id: 'cust-1',
    address_id: 'addr-1',
    status: 'delivered',
    pickup_date: '2026-10-13',
    pickup_window: 'morning',
    order_type: 'mixed',
    weight_lbs: 12,
    zone_id: 'zone_1',
    extended_reach_band: null,
    square_customer_id: 'sq-cust',
    square_card_id: 'sq-card',
    items: [
      { garment_type: 'shirt_blouse', service_type: 'dry_clean', quantity: 4 },
      { garment_type: 'hem_pants', service_type: 'alteration', quantity: 1 },
    ],
    address: { street: '9 Elm St', unit: null, city: 'Plano', zip: '75024' },
    ...over,
  });

  it('the link is signed, and lasts 14 days', () => {
    const token = rebookToken(ID, NOW);
    expect(readRebookToken(token, NOW)).toEqual({ ok: true, orderId: ID });
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    expect(readRebookToken(tampered, NOW)).toEqual({ ok: false, reason: 'invalid' });
    expect(readRebookToken(token, new Date('2026-10-31T15:00:00Z'))).toEqual({ ok: false, reason: 'expired' });
    expect(rebookUrl(ID, NOW)).toContain(`/rebook/${ID}.20261016.`);
  });

  it("plans the same weekday next week, same window and items (no alterations), with order two's $10", async () => {
    db.orders = [lastOrder()];
    const planned = await planRebook(supabase, ID, DEFAULT_COVERAGE, NOW);
    expect(planned).toMatchObject({
      ok: true,
      plan: { date: '2026-10-20', window: 'morning', address: '9 Elm St, Plano 75024', items: [{ garment_type: 'shirt_blouse', quantity: 4 }], weightLbs: 12, orderTwoDiscount: 10 },
    });
  });

  it('one tap books it on the card on file, with the hold scheduled and a confirmation; a second tap books nothing new', async () => {
    db.orders = [lastOrder()];
    const booked = await bookRebook(supabase, ID, DEFAULT_COVERAGE, NOW);
    expect(booked).toMatchObject({ ok: true, replay: false });
    expect(db.orders[1]).toMatchObject({ pickup_date: '2026-10-20', square_card_id: 'sq-card', hold_status: 'scheduled', order_two_discount: 10, frequency: 'one_time' });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ stage: 'booked', customMessage: expect.stringContaining("You're booked for") }));
    const again = await bookRebook(supabase, ID, DEFAULT_COVERAGE, NOW);
    expect(again).toMatchObject({ ok: true, replay: true });
    expect(db.orders).toHaveLength(2);
  });

  it('falls back to normal booking without a card, and to the Routine page for a member', async () => {
    db.orders = [lastOrder({ square_card_id: null })];
    expect(await planRebook(supabase, ID, DEFAULT_COVERAGE, NOW)).toEqual({ ok: false, reason: 'no_card' });
    db.orders = [lastOrder()];
    db.routine_memberships = [{ id: 'm1', customer_id: 'cust-1', status: 'active' }];
    expect(await planRebook(supabase, ID, DEFAULT_COVERAGE, NOW)).toEqual({ ok: false, reason: 'member' });
  });

  it("the delivered text asks \"Book next week's pickup?\" with the link", () => {
    const base = { orderId: 'o1', orderNumber: 'F11-1', customerName: 'Dana', customerPhone: '+12145550100', stage: 'delivered', trackingUrl: 'https://x.test/track/o1' };
    expect(formatStageMessage({ ...base, rebookUrl: 'https://x.test/rebook/abc' } as never).smsBody).toContain("Book next week's pickup? https://x.test/rebook/abc");
    expect(formatStageMessage(base as never).smsBody).toContain('Book your next pickup: https://x.test/book');
  });
});

describe('The Day 6 nudge', () => {
  const NOW = new Date('2026-10-20T15:00:00Z'); // 6 days after the delivery on October 14
  const ID = '11111111-2222-4333-8444-555555555555';
  beforeEach(() => {
    db.orders = [{ id: ID, customer_id: 'cust-1', status: 'delivered', pickup_date: '2026-10-12', routine_membership_id: null, customer: db.customers[0] }];
    db.order_events = [{ order_id: ID, status: 'delivered', timestamp: '2026-10-14T18:00:00.000Z' }];
  });

  it('goes once, by email unless they agreed to promotional texts, with the one-tap link', async () => {
    expect(await sendOrderTwoNudges(supabase, NOW)).toEqual({ sent: 1 });
    expect(contact).toHaveBeenCalledWith(
      expect.objectContaining({
        smsConsent: false,
        body: expect.stringMatching(/^Eleven at First Eleven Cleaners: Hi Dana, ready for round two\? Your next pickup is one tap away, and it's \$10 off: \S+\/rebook\/\S+\. Reply STOP to opt out\.$/),
      })
    );
    expect(db.customers[0].order_two_nudged_at).toBeTruthy();
    contact.mockClear();
    db.orders[0].customer = db.customers[0];
    expect(await sendOrderTwoNudges(supabase, NOW)).toEqual({ sent: 0 });
    expect(contact).not.toHaveBeenCalled();
  });

  it('not before day 6, and not once there is a second order', async () => {
    expect(await sendOrderTwoNudges(supabase, new Date('2026-10-19T15:00:00Z'))).toEqual({ sent: 0 });
    db.orders.push({ id: 'second', customer_id: 'cust-1', status: 'booked', pickup_date: '2026-10-22' });
    expect(await sendOrderTwoNudges(supabase, NOW)).toEqual({ sent: 0 });
  });
});
