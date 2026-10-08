import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Client 2026-10-07 (revised): "The system auto-creates each order 48 hours
// ahead, sends 'Your pickup is Tuesday morning, skip this one?', and places the
// authorization at creation. One tap to skip; skip never cancels. Three
// consecutive skips -> auto-pause plus an Eleven check-in."
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const rpcCalls: Row[] = [];
let rpcReplay = false;

/** In-memory Supabase: the filters the Routine code uses really filter. */
function table(name: string) {
  type Filter = (r: Row) => boolean;
  const filters: Filter[] = [];
  let op: 'select' | 'insert' | 'update' = 'select';
  let values: Row = {};
  let order: { col: string; asc: boolean } | null = null;
  let limit = Infinity;
  const rows = () => (db[name] ||= []);
  const matching = () => {
    let out = rows().filter((r) => filters.every((f) => f(r)));
    if (order) {
      const { col, asc } = order;
      out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    return out.slice(0, limit);
  };
  const run = () => {
    if (op === 'insert') {
      rows().push({ id: `${name}-${rows().length + 1}`, ...values });
      return { data: null, error: null };
    }
    if (op === 'update') {
      const hit = matching();
      hit.forEach((r) => Object.assign(r, values));
      return { data: hit, error: null };
    }
    return { data: matching(), error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (v: Row) => ((op = 'insert'), (values = v), b),
    update: (v: Row) => ((op = 'update'), (values = v), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    not: (c: string, _op: string, v: unknown) => (filters.push((r) => (r[c] ?? null) !== v), b),
    lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), b),
    lte: (c: string, v: string) => (filters.push((r) => r[c] != null && String(r[c]) <= v), b),
    gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), b),
    order: (col: string, o?: { ascending?: boolean }) => ((order = { col, asc: o?.ascending !== false }), b),
    limit: (n: number) => ((limit = n), b),
    maybeSingle: async () => {
      const r = matching()[0] ?? null;
      // Embedded customer, as Supabase returns it
      if (r && name === 'routine_memberships') return { data: { ...r, customer: (db.customers || []).find((c) => c.id === r.customer_id) ?? null }, error: null };
      return { data: r, error: null };
    },
    then: (resolve: (r: unknown) => unknown) => {
      const out = run();
      if (op === 'select' && name === 'routine_memberships') {
        out.data = (out.data as Row[]).map((r) => ({ ...r, customer: (db.customers || []).find((c) => c.id === r.customer_id) ?? null }));
      }
      return Promise.resolve(out).then(resolve);
    },
  };
  return b;
}

const admin = {
  from: table,
  rpc: async (fn: string, args: Row) => {
    rpcCalls.push({ fn, ...args });
    const p = args.p as Row;
    const order = p.order as Row;
    if (rpcReplay) return { data: { ok: true, replay: true, order: { id: 'existing', order_number: 'F11-OLD' } }, error: null };
    const id = `0000000${rpcCalls.length}-aaaa-4bbb-8ccc-dddddddddddd`;
    (db.orders ||= []).push({ id, status: 'booked', ...order });
    return { data: { ok: true, replay: false, order: { id, order_number: order.order_number } }, error: null };
  },
};
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));
const dispatch = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: (...a: unknown[]) => dispatch(...(a as [])) } }));
const contact = vi.fn(async () => ({ channel: 'sms', ok: true }));
vi.mock('@/lib/messaging/contact', () => ({ sendContactMessage: (...a: unknown[]) => contact(...(a as [])), sendSms: async () => ({ ok: true }) }));
const releaseOrderHold = vi.fn(async () => undefined);
vi.mock('@/lib/payment-capture', () => ({ releaseOrderHold: (...a: unknown[]) => releaseOrderHold(...(a as [])) }));
const reportError = vi.fn();
vi.mock('@/lib/error-reporting', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { DEFAULT_COVERAGE_SETTINGS, buildCoverage } from '@/lib/coverage';
import {
  createRoutinePickups,
  routineIdempotencyKey,
  routineSkipToken,
  orderIdFromSkipToken,
  routineReminderText,
} from '@/lib/routine-pickups';
import { skipAutoPickup } from '@/lib/routine-store';
import { skipNextZone5Pickup } from '@/lib/zone5-skip';
import { GET as skipGET, POST as skipPOST } from '@/app/api/routine/skip/route';

const LIVE = buildCoverage({ ...DEFAULT_COVERAGE_SETTINGS, extendedReach: { ...DEFAULT_COVERAGE_SETTINGS.extendedReach, firstRunDate: '2026-10-21' } });
const NOW = new Date('2026-10-09T14:00:00Z'); // Friday, October 9, 9 AM Dallas

const membership = (over: Row = {}): Row => ({
  id: 'm-1',
  customer_id: 'c-1',
  status: 'active',
  cadence: 'weekly',
  pickup_day: 'Saturday',
  pickup_window: 'morning',
  address_id: 'a-1',
  next_pickup_date: '2026-10-10',
  paused_until: null,
  consecutive_skips: 0,
  template: { zone_id: 'zone_1', extended_reach_band: null, order_type: 'mixed', services: { type: 'mixed', dry_clean_items: [{ garment_type: 'dress_shirt', quantity: 4 }], estimated_weight_lbs: 15 } },
  square_customer_id: 'SQ_CUST',
  square_card_id: 'ccof:CARD',
  enrolled_order_id: 'first',
  created_at: '2026-10-01T00:00:00Z',
  ...over,
});

const originalEnv = { ...process.env };
beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.customers = [{ id: 'c-1', full_name: 'Rita Routine', phone: '+12145550100', email: 'rita@example.com', sms_consent: true }];
  rpcCalls.length = 0;
  rpcReplay = false;
  dispatch.mockClear();
  contact.mockClear();
  releaseOrderHold.mockClear();
  reportError.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
});
afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Automatic Routine pickups, 2 days ahead', () => {
  it('makes the pickup with the estimate, the member discount and a scheduled hold, then texts "skip this one?"', async () => {
    db.routine_memberships = [membership({ next_pickup_date: '2026-10-10' })];
    expect(await createRoutinePickups(admin as never, LIVE, NOW)).toEqual({ created: 1, resumed: 0, problems: 0 });
    const p = rpcCalls[0].p as Row;
    expect(p).toMatchObject({ idempotency_key: routineIdempotencyKey('m-1', '2026-10-10'), window_capacity: 1000 });
    expect(p.order).toMatchObject({
      customer_id: 'c-1',
      address_id: 'a-1',
      pickup_date: '2026-10-10',
      pickup_window: 'morning',
      frequency: 'weekly',
      routine_membership_id: 'm-1',
      hold_status: 'scheduled',
      square_card_id: 'ccof:CARD',
      zone_id: 'zone_1',
      // Saturday pickups are delivered Tuesday
      delivery_date: '2026-10-13',
    });
    expect((p.order as Row).discount_amount).toBeGreaterThan(0);
    expect(db.routine_memberships[0].next_pickup_date).toBe('2026-10-17');
    const sent = dispatch.mock.calls[0] as unknown as [Row];
    expect(sent[0].customTitle).toBe('🔄 Your Routine pickup is Saturday');
    expect(sent[0].customMessage).toMatch(
      /^First Eleven Cleaners: Hi Rita, your Routine pickup is Saturday morning, October 10 \(7:30 to 10:00 AM\)\. Skip this one\? Reply SKIP or tap .+\/routine\/skip\/0000000\d-.+\. Nothing to do if you're all set\.$/
    );
  });

  it('a pickup further out waits; a second run never makes it twice', async () => {
    db.routine_memberships = [membership({ next_pickup_date: '2026-10-12' })];
    expect(await createRoutinePickups(admin as never, LIVE, NOW)).toMatchObject({ created: 0 });
    db.routine_memberships = [membership({ next_pickup_date: '2026-10-10' })];
    rpcReplay = true;
    expect(await createRoutinePickups(admin as never, LIVE, NOW)).toMatchObject({ created: 0 });
    expect(dispatch).not.toHaveBeenCalled();
    expect(routineIdempotencyKey('m-1', '2026-10-10')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('paused members get nothing; an ended pause resumes and says so', async () => {
    db.routine_memberships = [membership({ status: 'paused', next_pickup_date: null, paused_until: '2026-10-09', consecutive_skips: 3 })];
    expect(await createRoutinePickups(admin as never, LIVE, NOW)).toEqual({ created: 0, resumed: 1, problems: 0 });
    expect(db.routine_memberships[0]).toMatchObject({ status: 'active', consecutive_skips: 0, next_pickup_date: '2026-10-17' });
    expect(contact).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('your Routine is back on. Next pickup: Saturday, October 17') }));
  });

  it('a day that is no longer a route day moves on and an admin is told', async () => {
    db.routine_memberships = [membership({ pickup_day: 'Monday', next_pickup_date: '2026-10-10', template: { zone_id: 'zone_4', services: {} } })];
    expect(await createRoutinePickups(admin as never, LIVE, NOW)).toMatchObject({ created: 0, problems: 1 });
    expect(reportError).toHaveBeenCalledWith('routine/pickup', expect.any(String), expect.objectContaining({ alert: true }));
  });

  it('the skip streak starts over once a pickup goes ahead', async () => {
    db.routine_memberships = [membership({ consecutive_skips: 2 })];
    db.orders = [{ id: 'prev', routine_membership_id: 'm-1', pickup_date: '2026-10-03', status: 'delivered' }];
    await createRoutinePickups(admin as never, LIVE, NOW);
    expect(db.routine_memberships[0].consecutive_skips).toBe(0);
  });
});

describe('Skipping a pickup already made', () => {
  const auto = { id: '11111111-aaaa-4bbb-8ccc-dddddddddddd', routine_membership_id: 'm-1', pickup_date: '2026-10-10', pickup_window: 'morning', status: 'booked', hold_status: 'scheduled' };

  it('cancels that one pickup and releases its hold; the Routine carries on', async () => {
    db.routine_memberships = [membership({ next_pickup_date: '2026-10-17' })];
    db.orders = [{ ...auto }];
    const decision = await skipAutoPickup(admin as never, membership({ next_pickup_date: '2026-10-17' }) as never, auto, NOW);
    expect(decision).toMatchObject({ ok: true, skippedDate: '2026-10-10' });
    expect(db.orders[0].status).toBe('cancelled');
    expect(db.routine_memberships[0]).toMatchObject({ status: 'active', consecutive_skips: 1, next_pickup_date: '2026-10-17' });
    expect(releaseOrderHold).toHaveBeenCalled();
  });

  it('the third in a row pauses it and sends the check-in', async () => {
    db.routine_memberships = [membership({ consecutive_skips: 2, next_pickup_date: '2026-10-17' })];
    db.orders = [{ ...auto }];
    const decision = await skipAutoPickup(admin as never, membership({ consecutive_skips: 2 }) as never, auto, NOW);
    expect(decision).toMatchObject({ ok: true, autoPaused: true });
    expect(db.routine_memberships[0]).toMatchObject({ status: 'paused', consecutive_skips: 3, next_pickup_date: null, paused_until: '2026-12-04' });
    expect(contact).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining("you've skipped 3 pickups in a row") }));
  });

  it('one tap: the signed link skips it (no sign-in); a tampered link does nothing', async () => {
    db.routine_memberships = [membership({ next_pickup_date: '2026-10-17' })];
    db.orders = [{ ...auto }];
    const token = routineSkipToken(auto.id);
    expect(orderIdFromSkipToken(token)).toBe(auto.id);
    expect(orderIdFromSkipToken(`${auto.id}.deadbeefdeadbeefdeadbeef`)).toBeNull();

    const look = await skipGET(new Request(`http://localhost/api/routine/skip?token=${token}`));
    expect(await look.json()).toMatchObject({ canSkip: true, pickupLabel: 'Saturday, October 10' });
    const bad = await skipPOST(new Request('http://localhost/api/routine/skip', { method: 'POST', body: JSON.stringify({ token: `${auto.id}.x` }) }));
    expect(bad.status).toBe(404);
    expect(db.orders[0].status).toBe('booked');

    const res = await skipPOST(new Request('http://localhost/api/routine/skip', { method: 'POST', body: JSON.stringify({ token }) }));
    expect(await res.json()).toMatchObject({ success: true, autoPaused: false });
    expect(db.orders[0].status).toBe('cancelled');
    const again = await skipPOST(new Request('http://localhost/api/routine/skip', { method: 'POST', body: JSON.stringify({ token }) }));
    expect(await again.json()).toEqual({ error: 'This pickup is already skipped.' });
  });

  it('replying SKIP to the reminder skips the Routine pickup', async () => {
    db.routine_memberships = [membership({ next_pickup_date: '2026-10-17' })];
    db.orders = [{ ...auto, customer_id: 'c-1' }];
    db.customers[0].phone = '+12145550100';
    const reply = await skipNextZone5Pickup(admin as never, '+12145550100', NOW);
    expect(reply).toBe('First Eleven Cleaners: Done, your Sat Oct 10 pickup is skipped and nothing is charged. Your Routine carries on as usual.');
    expect(db.orders[0].status).toBe('cancelled');
  });

  it('the reminder wording', () => {
    expect(routineReminderText('Rita', '2026-10-13', 'evening', 'https://x/s')).toBe(
      "First Eleven Cleaners: Hi Rita, your Routine pickup is Tuesday evening, October 13 (5:00 to 8:00 PM). Skip this one? Reply SKIP or tap https://x/s. Nothing to do if you're all set."
    );
  });
});
