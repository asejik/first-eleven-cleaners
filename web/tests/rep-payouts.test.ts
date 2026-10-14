import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Client 2026-10-14, the weekly payout report: "Rep gets $10 for every verified first order
// on their code, plus $25 for each of the first 11 in that territory (Starting XI).
// 'Verified' means captured, not booked. If the order is fully refunded in the same payout
// week, it drops off." Drivers' referral cards: "$5 per conversion, no Starting XI bonus."
// "Payout week is Monday to Sunday. Report ready Monday morning."
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
  let keepExisting = false;
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
      if (!hit) rows().push({ id: nextId(), ...values });
      else if (!keepExisting) Object.assign(hit, values);
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
    upsert: (v: Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => ((op = 'upsert'), (values = v), (conflict = opts?.onConflict ?? null), (keepExisting = Boolean(opts?.ignoreDuplicates)), b),
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


import {
  payoutWeekOf,
  lastClosedWeek,
  recordRepConversion,
  markRepConversionRefunded,
  droppedOff,
  startingXi,
  buildPayoutReport,
  payoutReportCsv,
  type Conversion,
} from '@/lib/rep-payouts';

const supabase = admin as never;

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.territories = [{ id: '1D', name: 'Plano', zone_id: 'zone_1' }, { id: '1F', name: 'Richardson', zone_id: 'zone_1' }];
  db.territory_zips = [{ zip: '75024', territory_id: '1D' }, { zip: '75080', territory_id: '1F' }];
  db.reps = [
    { code: '1D-W1-JM', territory_id: '1D', rep_name: 'Jamie M', kind: 'field', active: true },
    { code: '1D-W1-DR', territory_id: '1D', rep_name: 'Dana Driver', kind: 'driver', active: true },
  ];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('The payout week', () => {
  it('runs Monday to Sunday, Dallas time; the report opens on the week just ended', () => {
    expect(payoutWeekOf(new Date('2026-10-19T04:30:00Z'))).toBe('2026-10-12'); // Sunday 11:30 PM Dallas
    expect(payoutWeekOf(new Date('2026-10-19T05:30:00Z'))).toBe('2026-10-19'); // Monday 12:30 AM Dallas
    expect(lastClosedWeek(new Date('2026-10-19T13:00:00Z'))).toBe('2026-10-12'); // Monday morning
  });
});

describe('Verified first orders (captured, not booked)', () => {
  const order = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    customer_id: 'c1',
    status: 'weighed_itemized',
    rep_code: null,
    created_at: '2026-10-14T15:00:00Z',
    address: { zip: '75080' },
    customer: { rep_code: '1D-W1-JM' },
    ...over,
  });

  it('a rep-coded customer\'s first order is recorded when charged, in their address territory', async () => {
    db.orders = [order('o1')];
    await recordRepConversion(supabase, 'o1', new Date('2026-10-15T15:00:00Z'));
    expect(db.rep_conversions).toEqual([
      expect.objectContaining({ customer_id: 'c1', order_id: 'o1', rep_code: '1D-W1-JM', rep_kind: 'field', territory_id: '1F', captured_at: '2026-10-15T15:00:00.000Z' }),
    ]);
    // Charged again (a retry): still one
    await recordRepConversion(supabase, 'o1', new Date('2026-10-16T15:00:00Z'));
    expect(db.rep_conversions).toHaveLength(1);
  });

  it('not a later order, not without a code; a driver\'s code is a card conversion; no territory: the rep\'s', async () => {
    db.orders = [order('first', { created_at: '2026-10-01T15:00:00Z' }), order('o2')];
    await recordRepConversion(supabase, 'o2');
    expect(db.rep_conversions ?? []).toHaveLength(0);

    db.orders = [order('o3', { customer: { rep_code: null } })];
    await recordRepConversion(supabase, 'o3');
    expect(db.rep_conversions ?? []).toHaveLength(0);

    db.orders = [order('o4', { customer_id: 'c4', customer: { rep_code: '1D-W1-DR' }, address: { zip: '99999' } })];
    await recordRepConversion(supabase, 'o4');
    expect(db.rep_conversions).toEqual([expect.objectContaining({ customer_id: 'c4', rep_kind: 'driver', territory_id: '1D' })]);
  });

  it('a full refund is noted; in the same week it drops off, a week later it stays', async () => {
    db.rep_conversions = [{ id: 'x', order_id: 'o1', captured_at: '2026-10-14T15:00:00.000Z', refunded_at: null }];
    await markRepConversionRefunded(supabase, 'o1', new Date('2026-10-17T15:00:00Z'));
    expect(droppedOff(db.rep_conversions[0] as unknown as Conversion)).toBe(true);
    expect(droppedOff({ captured_at: '2026-10-14T15:00:00.000Z', refunded_at: '2026-10-20T15:00:00.000Z' })).toBe(false);
  });
});

describe('Starting XI', () => {
  const conv = (i: number, over: Partial<Conversion> = {}): Conversion => ({
    id: `c${String(i).padStart(2, '0')}`,
    customer_id: `cust${i}`,
    order_id: `o${i}`,
    rep_code: '1D-W1-JM',
    rep_kind: 'field',
    territory_id: '1D',
    captured_at: new Date(Date.UTC(2026, 9, 1, 12) + i * 3600_000).toISOString(),
    refunded_at: null,
    ...over,
  });

  it('the first 11 per territory, numbered; drivers never take a place; one dropped in its week frees its place', () => {
    const list = [
      ...Array.from({ length: 12 }, (_, i) => conv(i + 1)),
      conv(50, { rep_kind: 'driver', captured_at: '2026-09-30T12:00:00.000Z' }),
      conv(60, { territory_id: '1F' }),
    ];
    const xi = startingXi(list);
    expect(xi.get('c01')).toBe(1);
    expect(xi.get('c11')).toBe(11);
    expect(xi.has('c12')).toBe(false);
    expect(xi.has('c50')).toBe(false);
    expect(xi.get('c60')).toBe(1);

    list[0].refunded_at = new Date(Date.parse(list[0].captured_at) + 3600_000).toISOString();
    const again = startingXi(list);
    expect(again.has('c01')).toBe(false);
    expect(again.get('c12')).toBe(11);
  });
});

describe('The weekly report', () => {
  it('$10 per verified first order, $25 per Starting XI, $5 per driver conversion; signups; a total; a CSV', async () => {
    db.rep_conversions = [
      // Before this week: Starting XI #1 and #2 already taken in 1D
      { id: 'a', customer_id: 'p1', order_id: 'q1', rep_code: '1D-W1-JM', rep_kind: 'field', territory_id: '1D', captured_at: '2026-10-06T15:00:00.000Z', refunded_at: null },
      { id: 'b', customer_id: 'p2', order_id: 'q2', rep_code: '1D-W1-JM', rep_kind: 'field', territory_id: '1D', captured_at: '2026-10-07T15:00:00.000Z', refunded_at: null },
      // This week (Oct 12 to 18): two verified (#3 and #4), one refunded the same week
      { id: 'c', customer_id: 'p3', order_id: 'q3', rep_code: '1D-W1-JM', rep_kind: 'field', territory_id: '1D', captured_at: '2026-10-13T15:00:00.000Z', refunded_at: null },
      { id: 'd', customer_id: 'p4', order_id: 'q4', rep_code: '1D-W1-JM', rep_kind: 'field', territory_id: '1D', captured_at: '2026-10-14T15:00:00.000Z', refunded_at: null },
      { id: 'e', customer_id: 'p5', order_id: 'q5', rep_code: '1D-W1-JM', rep_kind: 'field', territory_id: '1D', captured_at: '2026-10-15T15:00:00.000Z', refunded_at: '2026-10-16T15:00:00.000Z' },
      { id: 'f', customer_id: 'p6', order_id: 'q6', rep_code: '1D-W1-DR', rep_kind: 'driver', territory_id: '1D', captured_at: '2026-10-15T15:00:00.000Z', refunded_at: null },
      { id: 'g', customer_id: 'p7', order_id: 'q7', rep_code: '1D-W1-DR', rep_kind: 'driver', territory_id: '1D', captured_at: '2026-10-16T15:00:00.000Z', refunded_at: null },
    ];
    db.customers = [
      { id: 'p3', rep_code: '1D-W1-JM', rep_code_at: '2026-10-12T15:00:00.000Z' },
      { id: 'p8', rep_code: '1D-W1-JM', rep_code_at: '2026-10-17T15:00:00.000Z' },
      { id: 'p9', rep_code: '1D-W1-DR', rep_code_at: '2026-10-01T15:00:00.000Z' },
    ];
    const report = await buildPayoutReport(supabase, '2026-10-12');
    expect(report).toMatchObject({ week: '2026-10-12', weekEnd: '2026-10-18', total: 80 });
    expect(report.rows).toEqual([
      expect.objectContaining({ code: '1D-W1-DR', kind: 'driver', signups: 0, cardConversions: 2, amount: 10 }),
      expect.objectContaining({ code: '1D-W1-JM', kind: 'field', signups: 2, verified: 2, startingXi: [3, 4], amount: 70 }),
    ]);
    const csv = payoutReportCsv(report);
    expect(csv.split('\n')[0]).toBe('Week,Rep code,Rep,Type,Signups,Verified first orders,Starting XI,Referral-card conversions,Payout ($)');
    expect(csv).toContain('2026-10-12 to 2026-10-18,1D-W1-JM,Jamie M,Field rep,2,2,#3 #4,0,70.00');
    expect(csv).toContain(',Total,80.00');
  });
});
