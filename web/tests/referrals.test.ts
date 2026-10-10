import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Client 2026-10-10: "Referral: yes, let's build it. Give $15 / Get $15.
// Everyone gets a personal code and link in their account; the new customer
// gets $15 off their first order (min order applies), the referrer gets $15
// credit when that order completes. Members included." And: "Account credits
// (referral, Make It Right) still apply to members; they're money, not promos."
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
  const rows = () => (db[name] ||= []);
  const matching = () => rows().filter((r) => filters.every((f) => f(r))).slice(0, limit);
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
    gte: () => b,
    order: () => b,
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
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: async () => ({ success: true }) } }));
const contact = vi.fn(async () => ({ ok: true }));
vi.mock('@/lib/messaging/contact', () => ({ sendContactMessage: (...a: unknown[]) => contact(...(a as [])), sendSms: async () => ({ ok: true }) }));

import {
  makeReferralCode,
  getOrCreateReferralCode,
  checkReferralForBooking,
  rewardReferralForDeliveredOrder,
  applyCreditToOrder,
  creditBalance,
} from '@/lib/referrals';
import { POST as bookingPOST } from '@/app/api/bookings/route';
import { POST as validatePOST } from '@/app/api/promo/validate/route';
import { GET as referralLinkGET } from '@/app/r/[code]/route';
import { chatPriceList } from '@/lib/ai/price-list';

const supabase = admin as never;
const originalEnv = { ...process.env };
beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.customers = [{ id: 'friend-1', email: 'riley@example.com', full_name: 'Riley Ref', role: 'customer', auth_id: 'auth-riley' }];
  db.referral_codes = [{ customer_id: 'friend-1', code: 'RILEY7K3Q' }];
  signedInAuthId = null;
  contact.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
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
const book = (code: string, extra: Row = {}) =>
  bookingPOST(
    new Request('http://localhost/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        customer: { full_name: 'Nina New', email: 'nina@example.com', phone: '2145550101' },
        address: { street: '9 Elm St', city: 'Plano', state: 'TX', zip: '75024' },
        services: { type: 'wash_fold', dry_clean_items: [], estimated_weight_lbs: 20 },
        schedule: { pickup_date: nextMonday(), pickup_window: 'morning', express_tier: 'standard', frequency: 'one_time' },
        pricing: { subtotal: 0, total: 0, promo_code: code },
        consents: { payment_terms: true },
        ...extra,
      }),
    })
  );

describe('Codes', () => {
  it('first name plus 4 characters that cannot be misread; made once per customer', async () => {
    expect(makeReferralCode('Dana Lee')).toMatch(/^DANA[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    expect(makeReferralCode('')).toMatch(/^F11[A-Z2-9]{4}$/);
    const first = await getOrCreateReferralCode(supabase, { id: 'c-9', full_name: 'Sam Smith' });
    expect(await getOrCreateReferralCode(supabase, { id: 'c-9', full_name: 'Sam Smith' })).toBe(first);
  });

  it('a first order only, and never your own code', async () => {
    expect(await checkReferralForBooking(supabase, 'riley7k3q', { customerId: null, email: 'nina@example.com' })).toEqual({ ok: true, referrerId: 'friend-1', code: 'RILEY7K3Q' });
    expect(await checkReferralForBooking(supabase, 'RILEY7K3Q', { customerId: null, email: 'Riley@example.com' })).toMatchObject({ ok: false, error: expect.stringContaining('your own') });
    db.orders = [{ id: 'o-old', customer_id: 'c-old', status: 'delivered' }];
    expect(await checkReferralForBooking(supabase, 'RILEY7K3Q', { customerId: 'c-old', email: 'old@example.com' })).toMatchObject({ ok: false, error: expect.stringContaining('first order') });
    expect(await checkReferralForBooking(supabase, 'NOPE1234', { customerId: null, email: 'x@example.com' })).toMatchObject({ ok: false });
  });
});

describe('Booking with a friend\'s code', () => {
  it('$15 off the first order, and the referral is recorded', async () => {
    const res = await book('RILEY7K3Q');
    expect(res.status).toBe(200);
    const order = db.orders[0];
    expect(order).toMatchObject({ promo_code: null, referral_code: 'RILEY7K3Q', referral_discount: 15 });
    // 20 lb wash & fold = $60, $15 off
    expect(order.discount_amount).toBe(15);
    expect(db.referrals).toEqual([expect.objectContaining({ referrer_customer_id: 'friend-1', referred_order_id: order.id, status: 'pending' })]);
  });

  it('applies when the new customer joins the Routine (money, not a promo)', async () => {
    const res = await book('RILEY7K3Q', {
      schedule: { pickup_date: nextMonday(), pickup_window: 'morning', express_tier: 'standard', frequency: 'weekly' },
      consents: { payment_terms: true, routine_terms: true },
    });
    expect(res.status).toBe(200);
    // $60 less 10% ($6) and $15
    expect(db.orders[0].discount_amount).toBe(21);
  });

  it('the promo box recognises it, and the link opens booking with it', async () => {
    const res = await validatePOST(new Request('http://localhost/api/promo/validate', { method: 'POST', body: JSON.stringify({ code: 'riley7k3q', email: 'nina@example.com' }) }));
    expect(await res.json()).toMatchObject({ valid: true, code: 'RILEY7K3Q', discount_type: 'referral', discount_value: 15 });
    const link = await referralLinkGET(new Request('http://localhost/r/riley7k3q') as never, { params: Promise.resolve({ code: 'riley7k3q' }) });
    expect(link.headers.get('location')).toBe('http://localhost/book?ref=RILEY7K3Q');
  });
});

describe('The referrer earns $15 when the order is delivered, and credit is used at intake', () => {
  it('rewarded once, and told', async () => {
    db.referrals = [{ id: 'ref-1', referrer_customer_id: 'friend-1', referred_customer_id: 'c-new', referred_order_id: 'o-first', status: 'pending' }];
    expect(await rewardReferralForDeliveredOrder(supabase, 'o-first')).toBe(true);
    expect(await rewardReferralForDeliveredOrder(supabase, 'o-first')).toBe(false);
    expect(await creditBalance(supabase, 'friend-1')).toBe(15);
    expect(db.referrals[0].status).toBe('rewarded');
    expect(contact).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('$15 of credit is on your account') }));
  });

  it('credit comes off the next order once, never more than the total', async () => {
    db.customer_credits = [{ id: 'g1', customer_id: 'friend-1', amount: 15, reason: 'referral_reward' }, { id: 'g2', customer_id: 'friend-1', amount: 20, reason: 'make_it_right' }];
    expect(await applyCreditToOrder(supabase, 'friend-1', 'o-next', 30)).toBe(30);
    expect(await applyCreditToOrder(supabase, 'friend-1', 'o-next', 30)).toBe(30);
    expect(await creditBalance(supabase, 'friend-1')).toBe(5);
  });

  it('Eleven knows the program', () => {
    expect(chatPriceList()).toContain('Give $15, Get $15');
  });
});
