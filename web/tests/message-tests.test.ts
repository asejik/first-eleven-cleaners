import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Client 2026-10-14: "Mission Control -> Messaging: I need to be able to run two versions
// of any message (A/B) and see sends, taps, and bookings for each."
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
const signedInAuthId: string | null = null;
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: signedInAuthId ? { id: signedInAuthId } : null } }) } }),
}));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }), getClientIp: () => '127.0.0.1' }));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: async () => ({ success: true }) } }));
const contact = vi.fn(async () => ({ ok: true }));
vi.mock('@/lib/messaging/contact', () => ({ sendContactMessage: (...a: unknown[]) => contact(...(a as [])), sendSms: async () => ({ ok: true }) }));


vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: { id: 'admin-1', email: 'owner@example.com', full_name: 'Owner', role: 'admin' } }),
}));

import { variantFor, checkMessageText, fillMessage, mergeMessageTests } from '@/lib/message-tests';
import { pickMessage, recordTap, recordBookingForMessages, messageTestStats, resetMessageTestsCache } from '@/lib/message-tests-store';
import { rebookLineForDelivered } from '@/lib/rebook';
import { GET as messagesGET, POST as messagesPOST } from '@/app/api/mission-control/messages/route';
import { GET as tapGET } from '@/app/m/[id]/route';

const supabase = admin as never;
const originalEnv = { ...process.env };
const B_NUDGE = 'Hi [First name], your $10 is waiting: [link]. Reply STOP to opt out.';

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  resetMessageTestsCache();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

const turnOnB = (key: string, b: string) => {
  db.app_settings = [{ key: 'message_tests', value: { [key]: { b, bOn: true, countFrom: null } } }];
  resetMessageTestsCache();
};

describe('Splitting customers', () => {
  it('everyone gets A while B is off; with B on, each customer always gets the same one, about half each', () => {
    expect(variantFor('cust-1', 'order_two_nudge', undefined)).toBe('A');
    expect(variantFor('cust-1', 'order_two_nudge', { b: 'x', bOn: false, countFrom: null })).toBe('A');
    const test = { b: 'Version B [link]', bOn: true, countFrom: null };
    const picks = Array.from({ length: 400 }, (_, i) => variantFor(`cust-${i}`, 'order_two_nudge', test));
    const bs = picks.filter((v) => v === 'B').length;
    expect(bs).toBeGreaterThan(150);
    expect(bs).toBeLessThan(250);
    expect(variantFor('cust-7', 'order_two_nudge', test)).toBe(variantFor('cust-7', 'order_two_nudge', test));
  });

  it('a version must keep its tracked link and known placeholders', () => {
    expect(checkMessageText('order_two_nudge', 'Hi [First name], come back!')).toContain('Keep [link]');
    expect(checkMessageText('order_two_nudge', 'Hi [Name], come back: [link]')).toContain('Use only these placeholders');
    expect(checkMessageText('order_two_nudge', B_NUDGE)).toBeNull();
    expect(checkMessageText('routeConfirmed', 'Your [City] run is on for Wed [date].')).toBeNull();
    expect(fillMessage(B_NUDGE, { 'First name': 'Dana', link: 'https://x.test/m/1' })).toBe('Hi Dana, your $10 is waiting: https://x.test/m/1. Reply STOP to opt out.');
    expect(mergeMessageTests({ order_two_nudge: { b: 'x', bOn: true }, nonsense: { b: 'y' } })).toEqual({ order_two_nudge: { b: 'x', bOn: true, countFrom: null } });
  });
});

describe('Sends, taps and bookings', () => {
  it('records each send with its version and a tracked link', async () => {
    turnOnB('order_two_nudge', B_NUDGE);
    const picks = await Promise.all(
      ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((id) => pickMessage(supabase, { key: 'order_two_nudge', recipient: id, customerId: id, targetUrl: 'https://firstelevencleaners.com/rebook/t' }))
    );
    expect(db.message_sends).toHaveLength(6);
    for (const p of picks) {
      expect(p.link).toMatch(/\/m\/[0-9a-f-]{36}$/);
      if (p.variant === 'B') expect(p.text).toBe(B_NUDGE);
      else expect(p.text).toContain('ready for round two');
    }
    expect(db.message_sends.map((r) => r.variant)).toEqual(picks.map((p) => p.variant));
  });

  it('a tap is counted and opens the page; an unknown link opens booking', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://firstelevencleaners.com';
    const picked = await pickMessage(supabase, { key: 'delivered_rebook', recipient: 'c1', customerId: 'c1', targetUrl: 'https://firstelevencleaners.com/rebook/t' });
    const res = await tapGET(new Request(`https://firstelevencleaners.com/m/${picked.sendId}`) as never, { params: Promise.resolve({ id: picked.sendId! }) });
    expect(res.headers.get('location')).toBe('https://firstelevencleaners.com/rebook/t');
    expect(db.message_sends[0]).toMatchObject({ tap_count: 1, tapped_at: expect.any(String) });
    await recordTap(supabase, picked.sendId!);
    expect(db.message_sends[0].tap_count).toBe(2);
    const unknown = await tapGET(new Request('https://firstelevencleaners.com/m/nope') as never, { params: Promise.resolve({ id: 'nope' }) });
    expect(unknown.headers.get('location')).toBe('https://firstelevencleaners.com/book');
  });

  it('a booking within 7 days counts for the latest message; an older one does not', async () => {
    db.message_sends = [
      { id: 'old', message_key: 'order_two_nudge', variant: 'A', customer_id: 'c1', sent_at: '2026-10-01T15:00:00.000Z', booked_order_id: null },
      { id: 'new', message_key: 'delivered_rebook', variant: 'B', customer_id: 'c1', sent_at: '2026-10-12T15:00:00.000Z', booked_order_id: null },
    ];
    await recordBookingForMessages(supabase, 'c1', 'order-9', new Date('2026-10-14T15:00:00Z'));
    expect(db.message_sends.find((r) => r.id === 'new')).toMatchObject({ booked_order_id: 'order-9' });
    expect(db.message_sends.find((r) => r.id === 'old')).toMatchObject({ booked_order_id: null });
    await recordBookingForMessages(supabase, 'c1', 'order-10', new Date('2026-10-30T15:00:00Z'));
    expect(db.message_sends.filter((r) => r.booked_order_id === 'order-10')).toHaveLength(0);
  });

  it('counts per version, since the count started', async () => {
    db.message_sends = [
      { message_key: 'order_two_nudge', variant: 'A', sent_at: '2026-10-10T00:00:00Z', tapped_at: 'x', booked_order_id: 'o1' },
      { message_key: 'order_two_nudge', variant: 'A', sent_at: '2026-10-10T00:00:00Z', tapped_at: null, booked_order_id: null },
      { message_key: 'order_two_nudge', variant: 'B', sent_at: '2026-10-10T00:00:00Z', tapped_at: 'x', booked_order_id: null },
      { message_key: 'order_two_nudge', variant: 'B', sent_at: '2026-09-01T00:00:00Z', tapped_at: 'x', booked_order_id: 'o2' },
    ];
    const stats = await messageTestStats(supabase, { order_two_nudge: { b: 'B [link]', bOn: true, countFrom: '2026-10-01T00:00:00Z' } });
    expect(stats.order_two_nudge).toEqual({ A: { sent: 2, tapped: 1, booked: 1 }, B: { sent: 1, tapped: 1, booked: 0 } });
  });

  it("the delivered text's line uses the customer's version", async () => {
    turnOnB('delivered_rebook', 'Same time next week? One tap: [link]');
    db.orders = [{ id: '11111111-2222-4333-8444-555555555555', customer_id: 'c-b', routine_membership_id: null }];
    const line = await rebookLineForDelivered(supabase, '11111111-2222-4333-8444-555555555555');
    const variant = db.message_sends[0].variant;
    expect(line).toMatch(variant === 'B' ? /^Same time next week\? One tap: \S+\/m\// : /^Book next week's pickup\? \S+\/m\//);
  });
});

describe('Mission Control > Message Tests', () => {
  const post = (body: Record<string, unknown>) => messagesPOST(new Request('http://localhost/api/mission-control/messages', { method: 'POST', body: JSON.stringify(body) }));

  it('saves a version B (it must keep [link]); a change starts a fresh count; the list shows both versions', async () => {
    expect((await post({ action: 'save', key: 'order_two_nudge', b: 'Come back soon!', bOn: true })).status).toBe(400);
    expect((await post({ action: 'save', key: 'order_two_nudge', b: B_NUDGE, bOn: true })).status).toBe(200);
    const saved = db.app_settings.find((r) => r.key === 'message_tests')!.value as Record<string, { b: string; bOn: boolean; countFrom: string }>;
    expect(saved.order_two_nudge).toMatchObject({ b: B_NUDGE, bOn: true, countFrom: expect.any(String) });
    expect(db.admin_audit_logs).toEqual([expect.objectContaining({ action: 'message_test.save', target_id: 'message_tests.order_two_nudge' })]);

    const list = await (await messagesGET(new Request('http://localhost/api/mission-control/messages'))).json();
    const nudge = list.messages.find((m: { key: string }) => m.key === 'order_two_nudge');
    expect(nudge).toMatchObject({ label: 'Day 6 nudge', b: B_NUDGE, bOn: true, a: expect.stringContaining('ready for round two') });
    expect(list.messages.map((m: { key: string }) => m.key)).toEqual(['order_two_nudge', 'delivered_rebook', 'onTheList', 'routeConfirmed', 'routeNotReached', 'waitlistJoined', 'thresholdReached', 'zone5Open']);
  });
});
