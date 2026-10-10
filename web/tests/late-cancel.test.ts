import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client 2026-10-08, Part 2 item 4: "Use the $15 failed-service policy for
// late cancels too... a row for 'cancels or reschedules under 2 hours before
// the window: $15', and Routine members get one waived per calendar month
// instead of the one-time courtesy. Zone 5 charges the Extended Reach fee
// instead of $15." Charged automatically after the customer confirms.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

/** In-memory Supabase with real filters (counts included). */
function table(name: string) {
  type Filter = (r: Row) => boolean;
  const filters: Filter[] = [];
  let op: 'select' | 'insert' | 'update' = 'select';
  let values: Row = {};
  let head = false;
  let limit = Infinity;
  let single = false;
  const rows = () => (db[name] ||= []);
  const matching = () => rows().filter((r) => filters.every((f) => f(r))).slice(0, limit);
  const run = () => {
    if (op === 'insert') {
      rows().push({ id: `${name}-${rows().length + 1}`, timestamp: new Date().toISOString(), ...values });
      return { data: null, error: null };
    }
    if (op === 'update') {
      const hit = matching();
      hit.forEach((r) => Object.assign(r, values));
      return { data: single ? hit[0] ?? null : hit, error: null };
    }
    return head ? { data: null, count: matching().length, error: null } : { data: matching(), error: null };
  };
  const b: Record<string, unknown> = {
    select: (_c?: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), b),
    insert: (v: Row) => ((op = 'insert'), (values = v), b),
    update: (v: Row) => ((op = 'update'), (values = v), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    not: (c: string, _op: string, v: unknown) => (filters.push((r) => (r[c] ?? null) !== v), b),
    gte: (c: string, v: string) => (filters.push((r) => r[c] != null && String(r[c]) >= v), b),
    like: (c: string, v: string) => (filters.push((r) => String(r[c] ?? '').startsWith(v.replace(/%$/, ''))), b),
    order: () => b,
    limit: (n: number) => ((limit = n), b),
    single: async () => ((single = true), run()),
    maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return b;
}
const admin = { from: table };
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
let signedIn: Row | null = null;
vi.mock('@/lib/supabase/auth-helpers', () => ({
  getAuthenticatedCustomer: async () => ({ customer: signedIn, user: signedIn ? { id: 'auth-1' } : null }),
  verifyApiAuth: async () => ({ customer: signedIn }),
}));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));
const reportError = vi.fn();
vi.mock('@/lib/error-reporting', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
vi.mock('@/lib/messaging/contact', () => ({ sendContactMessage: async () => ({ ok: true }), sendSms: async () => ({ ok: true }) }));

import { isLateCancel, lateCancelFeeFor, assessLateCancel } from '@/lib/late-cancel';
import { PATCH as cancelPATCH } from '@/app/api/orders/[id]/route';
import { skipNextZone5Pickup } from '@/lib/zone5-skip';
import { GET as skipGET, POST as skipPOST } from '@/app/api/routine/skip/route';
import { routineSkipToken } from '@/lib/routine-pickups';
import { buildLlmsTxt } from '@/lib/llms';
import { feesLine } from '@/lib/ai/price-list';

const ORDER = '22222222-aaaa-4bbb-8ccc-dddddddddddd';
const order = (over: Row = {}): Row => ({
  id: ORDER,
  order_number: 'F11-LATE',
  customer_id: 'c-1',
  status: 'booked',
  pickup_date: '2026-10-12',
  pickup_window: 'morning',
  extended_reach_band: null,
  extended_reach_fee: 0,
  routine_membership_id: null,
  square_customer_id: 'SQ_CUST',
  square_card_id: 'ccof:CARD',
  hold_status: 'none',
  hold_payment_id: null,
  ...over,
});
// Monday, October 12 (CDT, UTC-5): 5:29 AM / 5:30 AM / 2:59 PM / 3:00 PM Dallas
const at = (utc: string) => new Date(`2026-10-12T${utc}Z`);
const LATE_MORNING = at('10:30:00');

const originalEnv = { ...process.env };
beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.customers = [{ id: 'c-1', phone: '+12145550100' }];
  signedIn = { id: 'c-1', full_name: 'Lee Late', role: 'customer' };
  reportError.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
  delete process.env.SQUARE_ACCESS_TOKEN;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(LATE_MORNING);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

describe('When a cancel is late', () => {
  it('from 2 hours before the window: 5:30 AM for mornings, 3:00 PM for evenings (Dallas)', () => {
    expect(isLateCancel({ pickup_date: '2026-10-12', pickup_window: 'morning' }, at('10:29:00'))).toBe(false);
    expect(isLateCancel({ pickup_date: '2026-10-12', pickup_window: 'morning' }, at('10:30:00'))).toBe(true);
    expect(isLateCancel({ pickup_date: '2026-10-12', pickup_window: 'evening' }, at('19:59:00'))).toBe(false);
    expect(isLateCancel({ pickup_date: '2026-10-12', pickup_window: 'evening' }, at('20:00:00'))).toBe(true);
    expect(isLateCancel({ pickup_date: '2026-10-13', pickup_window: 'morning' }, at('20:00:00'))).toBe(false);
  });

  it('$15, or the Zone 5 order\'s Extended Reach fee', () => {
    expect(lateCancelFeeFor({ extended_reach_band: null, extended_reach_fee: 0 })).toBe(15);
    expect(lateCancelFeeFor({ extended_reach_band: 'A', extended_reach_fee: 35 })).toBe(35);
    expect(lateCancelFeeFor({ extended_reach_band: 'A', extended_reach_fee: 17.5 })).toBe(17.5);
  });

  it('the first is waived; after that it is charged', async () => {
    db.orders = [order()];
    expect(await assessLateCancel(admin as never, order() as never, LATE_MORNING)).toEqual({ late: true, fee: 15, waived: true, member: false });
    db.orders.push(order({ id: 'old', status: 'cancelled', late_cancel_status: 'waived', late_cancel_at: '2025-01-05T12:00:00Z' }));
    expect(await assessLateCancel(admin as never, order() as never, LATE_MORNING)).toMatchObject({ waived: false });
  });

  it('Routine members get one waived each calendar month', async () => {
    db.routine_memberships = [{ id: 'm-1', customer_id: 'c-1', status: 'active' }];
    db.orders = [order(), order({ id: 'old', status: 'cancelled', late_cancel_status: 'waived', late_cancel_at: '2026-09-28T12:00:00Z' })];
    expect(await assessLateCancel(admin as never, order() as never, LATE_MORNING)).toEqual({ late: true, fee: 15, waived: true, member: true });
    db.orders.push(order({ id: 'this-month', status: 'cancelled', late_cancel_status: 'waived', late_cancel_at: '2026-10-02T12:00:00Z' }));
    expect(await assessLateCancel(admin as never, order() as never, LATE_MORNING)).toMatchObject({ waived: false });
  });
});

const cancel = (body: Row) =>
  cancelPATCH(new Request(`http://localhost/api/orders/${ORDER}`, { method: 'PATCH', body: JSON.stringify({ action: 'cancel', ...body }) }), {
    params: Promise.resolve({ id: ORDER }),
  });

describe('Cancelling from the dashboard', () => {
  it('a late cancel shows the fee first, and is charged once confirmed', async () => {
    db.orders = [order(), order({ id: 'old', status: 'cancelled', late_cancel_status: 'waived', late_cancel_at: '2026-01-05T12:00:00Z' })];
    const first = await cancel({});
    expect(first.status).toBe(409);
    expect(await first.json()).toEqual({
      error: "It's less than 2 hours before your pickup, so cancelling now costs $15.00, charged to your card on file.",
      code: 'LATE_CANCEL_FEE',
      fee: 15,
      waived: false,
    });
    expect(db.orders[0].status).toBe('booked');

    const confirmed = await cancel({ confirm_late_fee: true });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({ lateCancel: { status: 'charged', fee: 15 } });
    expect(db.orders[0]).toMatchObject({ status: 'cancelled', late_cancel_status: 'charged', late_cancel_fee: 15 });
    expect(db.order_payments).toEqual([expect.objectContaining({ kind: 'late_cancel', amount: 15, status: 'completed' })]);
  });

  it('the first late cancel is free (and says so)', async () => {
    db.orders = [order()];
    const first = await cancel({});
    expect(await first.json()).toMatchObject({ code: 'LATE_CANCEL_FEE', waived: true, error: expect.stringContaining('Your first late change is free') });
    await cancel({ confirm_late_fee: true });
    expect(db.orders[0]).toMatchObject({ status: 'cancelled', late_cancel_status: 'waived' });
    expect(db.order_payments).toBeUndefined();
  });

  it('an early cancel has no fee; staff cancelling never pay it', async () => {
    vi.setSystemTime(at('09:00:00'));
    db.orders = [order()];
    expect((await cancel({})).status).toBe(200);
    expect(db.orders[0].late_cancel_status).toBeUndefined();
    vi.setSystemTime(LATE_MORNING);
    db.orders = [order()];
    signedIn = { id: 'admin-1', full_name: 'Ops', role: 'admin' };
    expect((await cancel({})).status).toBe(200);
    expect(db.orders[0].late_cancel_status).toBeUndefined();
  });

  it('a declined card is recorded and an admin is alerted', async () => {
    process.env.SQUARE_ACCESS_TOKEN = 'EAAAtest-sandbox-token';
    process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID = 'LOC123';
    process.env.SQUARE_ENVIRONMENT = 'sandbox';
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ errors: [{ detail: 'Card declined.' }] }), { status: 402 }));
    db.orders = [order(), order({ id: 'old', status: 'cancelled', late_cancel_status: 'waived', late_cancel_at: '2026-01-05T12:00:00Z' })];
    const res = await cancel({ confirm_late_fee: true });
    expect(await res.json()).toMatchObject({ lateCancel: { status: 'declined', fee: 15 } });
    expect(db.orders[0].late_cancel_status).toBe('declined');
    expect(reportError).toHaveBeenCalledWith('late-cancel/charge', 'Card declined.', expect.objectContaining({ alert: true }));
  });
});

describe('Skipping late: the link and a SKIP reply', () => {
  const member = { id: 'm-1', customer_id: 'c-1', status: 'active', cadence: 'weekly', pickup_day: 'Monday', pickup_window: 'morning', consecutive_skips: 0, enrolled_order_id: 'first', template: {} };

  it('the link page shows the fee; skipping needs the confirm', async () => {
    db.routine_memberships = [member];
    db.orders = [order({ routine_membership_id: 'm-1' }), order({ id: 'old', status: 'cancelled', late_cancel_status: 'waived', late_cancel_at: '2026-10-01T12:00:00Z' })];
    const token = routineSkipToken(ORDER);
    const look = await skipGET(new Request(`http://localhost/api/routine/skip?token=${token}`));
    expect(await look.json()).toMatchObject({ canSkip: true, lateFee: { fee: 15, waived: false } });
    const unconfirmed = await skipPOST(new Request('http://localhost/api/routine/skip', { method: 'POST', body: JSON.stringify({ token }) }));
    expect(unconfirmed.status).toBe(409);
    const confirmed = await skipPOST(new Request('http://localhost/api/routine/skip', { method: 'POST', body: JSON.stringify({ token, confirm_late_fee: true }) }));
    expect(await confirmed.json()).toMatchObject({ success: true, lateCancel: { status: 'charged', fee: 15 } });
  });

  it('pausing the Routine when its pickup is late asks first, then charges', async () => {
    const { applyRoutineChange } = await import('@/lib/routine-store');
    const { DEFAULT_COVERAGE } = await import('@/lib/coverage');
    db.routine_memberships = [{ ...member, next_pickup_date: '2026-10-19' }];
    db.orders = [order({ routine_membership_id: 'm-1' }), order({ id: 'old', status: 'cancelled', late_cancel_status: 'waived', late_cancel_at: '2026-10-01T12:00:00Z' })];
    const m = { ...member, next_pickup_date: '2026-10-19', paused_until: null, address_id: 'a', created_at: '' } as never;
    const asked = await applyRoutineChange(admin as never, m, { action: 'pause', weeks: 2 }, DEFAULT_COVERAGE, LATE_MORNING);
    expect(asked).toMatchObject({ ok: false, code: 'LATE_CANCEL_FEE', fee: 15, error: expect.stringContaining('pausing now costs $15.00') });
    expect(db.routine_memberships[0].status).toBe('active');
    const done = await applyRoutineChange(admin as never, m, { action: 'pause', weeks: 2 }, DEFAULT_COVERAGE, LATE_MORNING, { confirmLateFee: true });
    expect(done.ok).toBe(true);
    expect(db.orders[0]).toMatchObject({ status: 'cancelled', late_cancel_status: 'charged' });
  });

  it('SKIP acts on what our last text was about (client 2026-10-10)', async () => {
    db.routine_memberships = [{ ...member, next_pickup_date: '2026-10-20' }];
    const routinePickup = order({ id: 'routine-13', pickup_date: '2026-10-13', routine_membership_id: 'm-1' });
    const zone5Pickup = order({ id: 'zone5-14', pickup_date: '2026-10-14', extended_reach_band: 'A', extended_reach_fee: 35 });
    db.orders = [routinePickup, zone5Pickup];
    // Our last text was the Zone 5 "route not reached" one: SKIP leaves that run, not the Routine pickup
    db.messages = [{ customer_id: 'c-1', channel: 'sms', direction: 'outbound', order_id: 'zone5-14', created_at: '2026-10-12T09:00:00Z' }];
    expect(await skipNextZone5Pickup(admin as never, '+12145550100', LATE_MORNING)).toContain('Your Extended Reach pickup on Wed Oct 14 is cancelled');
    expect(db.orders.find((o) => o.id === 'zone5-14')?.status).toBe('cancelled');
    expect(db.orders.find((o) => o.id === 'routine-13')?.status).toBe('booked');
    // Our last text was the Routine reminder: SKIP skips that pickup
    db.messages = [{ customer_id: 'c-1', channel: 'sms', direction: 'outbound', order_id: 'routine-13', created_at: '2026-10-12T09:30:00Z' }];
    expect(await skipNextZone5Pickup(admin as never, '+12145550100', LATE_MORNING)).toContain('your Tue Oct 13 pickup is skipped');
    expect(db.orders.find((o) => o.id === 'routine-13')?.status).toBe('cancelled');
  });

  it('a late SKIP text explains the fee; a second SKIP within 15 minutes confirms it', async () => {
    db.orders = [order({ extended_reach_band: 'A', extended_reach_fee: 35 }), order({ id: 'old', status: 'cancelled', late_cancel_status: 'waived', late_cancel_at: '2026-01-05T12:00:00Z' })];
    const first = await skipNextZone5Pickup(admin as never, '+12145550100', LATE_MORNING);
    expect(first).toBe(
      "First Eleven Cleaners: It's less than 2 hours before your pickup, so skipping now costs $35.00, charged to your card on file. Reply SKIP again within 15 minutes to confirm. If you don't, our driver will come for your pickup as planned."
    );
    expect(db.orders[0].status).toBe('booked');
    const second = await skipNextZone5Pickup(admin as never, '+12145550100', new Date(LATE_MORNING.getTime() + 5 * 60_000));
    expect(second).toContain('is cancelled. The $35.00 late-cancel fee was charged to your card.');
    expect(db.orders[0]).toMatchObject({ status: 'cancelled', late_cancel_status: 'charged', late_cancel_fee: 35 });
  });
});

describe('Where the rule is shown', () => {
  it('the pricing card, Terms, Eleven and llms.txt', () => {
    const page = readFileSync(join(__dirname, '..', 'src', 'app', 'pricing', 'page.tsx'), 'utf8');
    expect(page).toContain('Cancels or reschedules under {LATE_CANCEL_CUTOFF_HOURS} hours before the window:');
    expect(page).toContain('One waived each month');
    expect(page).toContain('The Extended Reach fee instead');
    const terms = readFileSync(join(__dirname, '..', 'src', 'app', 'terms', 'page.tsx'), 'utf8');
    expect(terms).toContain('Customer cancels or reschedules under 2 hours before the window:');
    expect(feesLine()).toContain('Cancelling or rescheduling under 2 hours before the pickup window costs $15.00');
    expect(buildLlmsTxt()).toContain('Routine members get one waived each calendar month');
  });
});
