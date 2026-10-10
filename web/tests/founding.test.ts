import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client 2026-10-10, Founding 111: "Territory = a named group of ZIPs I set up
// in Mission Control... Counter runs per territory. Priority windows = first
// pick... Founders see each route day's windows 24 hours before everyone else.
// Lifetime pricing = their discount rate (10% / 5%) is locked for life...
// Status survives pauses; a cancel ends it, with 60 days to come back."
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const audit: Row[] = [];
const NOW = Date.parse('2026-10-10T15:00:00Z');

function table(name: string) {
  type Filter = (r: Row) => boolean;
  const filters: Filter[] = [];
  let op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  let values: Row = {};
  let conflict: string | null = null;
  const rows = () => (db[name] ||= []);
  const matching = () => rows().filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (op === 'insert') {
      if (name === 'territories' && rows().some((r) => r.id === values.id)) return { data: null, error: { code: '23505' } };
      rows().push({ ...values });
      return { data: null, error: null };
    }
    if (op === 'upsert') {
      const hit = conflict ? rows().find((r) => r[conflict!] === values[conflict!]) : undefined;
      if (hit) Object.assign(hit, values);
      else rows().push({ ...values });
      return { data: null, error: null };
    }
    if (op === 'delete') {
      const keep = rows().filter((r) => !filters.every((f) => f(r)));
      db[name] = keep;
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
    upsert: (v: Row, o?: { onConflict?: string }) => ((op = 'upsert'), (values = v), (conflict = o?.onConflict ?? null), b),
    delete: () => ((op = 'delete'), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    order: () => b,
    limit: () => b,
    maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return b;
}
/** claim_founding_number(), as the migration defines it */
async function rpc(fn: string, a: Row) {
  if (fn !== 'claim_founding_number') return { data: null, error: null };
  const founders = (db.founding_members ||= []);
  const mine = founders.find((f) => f.customer_id === a.p_customer);
  if (mine) {
    const ended = mine.ended_at ? Date.parse(String(mine.ended_at)) : null;
    if (ended === null || ended > NOW - 60 * 86400000) {
      mine.ended_at = null;
      mine.membership_id = a.p_membership;
      return { data: mine.number, error: null };
    }
    return { data: null, error: null };
  }
  const next = founders.filter((f) => f.territory_id === a.p_territory).length + 1;
  if (next > 111) return { data: null, error: null };
  founders.push({ territory_id: a.p_territory, number: next, customer_id: a.p_customer, membership_id: a.p_membership, locked_weekly_percent: a.p_weekly, locked_biweekly_percent: a.p_biweekly, ended_at: null });
  return { data: next, error: null };
}
const admin = { from: table, rpc };
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
vi.mock('@/lib/supabase/auth-helpers', () => ({ verifyApiAuth: async () => ({ customer: { id: 'admin-1', email: 'ops@firstelevencleaners.com', role: 'admin' } }) }));
vi.mock('@/lib/audit-log', () => ({ recordAdminAction: async (_s: unknown, e: Row) => void audit.push(e) }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimitAsync: async () => ({ allowed: true }), getClientIp: () => '127.0.0.1' }));

import { claimFounding, endFounding, founderStatus, planDiscountFor, founderBadge } from '@/lib/founding';
import { calculateOrderFinancials } from '@/lib/constants';
import { validateSchedule } from '@/lib/schedule';
import { GET as territoriesGET, POST as territoriesPOST } from '@/app/api/mission-control/territories/route';

const supabase = admin as never;
beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  audit.length = 0;
  db.territories = [
    { id: '1D', name: 'Plano', zone_id: 'zone_1' },
    { id: '5D', name: 'Sherman', zone_id: 'zone_5' },
  ];
  db.territory_zips = [
    { zip: '75024', territory_id: '1D' },
    { zip: '75090', territory_id: '5D' },
  ];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
});

describe('Founding 111 per territory', () => {
  it('numbers run per territory, from the address ZIP', async () => {
    expect(await claimFounding(supabase, { customerId: 'a', membershipId: 'm-a', zip: '75024' })).toMatchObject({ number: 1, territoryName: 'Plano' });
    expect(await claimFounding(supabase, { customerId: 'b', membershipId: 'm-b', zip: '75024' })).toMatchObject({ number: 2 });
    expect(await claimFounding(supabase, { customerId: 'c', membershipId: 'm-c', zip: '75090' })).toMatchObject({ number: 1, territoryName: 'Sherman' });
    expect(await claimFounding(supabase, { customerId: 'd', membershipId: 'm-d', zip: '75201' })).toBeNull(); // in no territory
    expect(founderBadge({ number: 2, territoryName: 'Plano' })).toBe('Founding Member #2 · Plano');
  });

  it('the 112th member in a territory is not a founder', async () => {
    db.founding_members = Array.from({ length: 111 }, (_, i) => ({ territory_id: '1D', number: i + 1, customer_id: `c${i}`, ended_at: null }));
    expect(await claimFounding(supabase, { customerId: 'late', membershipId: 'm', zip: '75024' })).toBeNull();
  });

  it('a pause keeps it; a cancel ends it, with 60 days to come back', async () => {
    await claimFounding(supabase, { customerId: 'a', membershipId: 'm-a', zip: '75024' });
    await endFounding(supabase, 'a', new Date(NOW - 10 * 86400000));
    expect((await founderStatus(supabase, 'a'))?.active).toBe(false);
    expect(await claimFounding(supabase, { customerId: 'a', membershipId: 'm-a2', zip: '75024' })).toMatchObject({ number: 1, active: true });
    await endFounding(supabase, 'a', new Date(NOW - 61 * 86400000));
    expect(await claimFounding(supabase, { customerId: 'a', membershipId: 'm-a3', zip: '75024' })).toBeNull();
    // The database function says the same
    const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '20261010_referrals_founding_tiers.sql'), 'utf8');
    expect(sql).toContain("v_ended IS NULL OR v_ended > NOW() - INTERVAL '60 days'");
    expect(sql).toContain('IF v_number > 111 THEN');
  });
});

describe('Lifetime pricing and first pick', () => {
  it('a founder keeps their locked rate even if the rate card changes', () => {
    const founder = { active: true, lockedRates: { weekly: 10, biweekly: 5 } };
    expect(planDiscountFor('weekly', founder)).toBe(10);
    expect(planDiscountFor('weekly', { active: true, lockedRates: { weekly: 12, biweekly: 6 } })).toBe(12);
    expect(planDiscountFor('weekly', { active: false, lockedRates: { weekly: 12, biweekly: 6 } })).toBe(10);
    expect(calculateOrderFinancials({ subtotal: 100, frequency: 'weekly', planDiscountPercent: 12 }).frequencyDiscount).toBe(12);
    expect(calculateOrderFinancials({ subtotal: 100, frequency: 'one_time', planDiscountPercent: 12 }).frequencyDiscount).toBe(0);
  });

  it('founders can book a day further ahead than everyone else', () => {
    const now = new Date('2026-10-10T15:00:00Z');
    const day61 = '2026-12-10'; // 61 days after October 10 (a Thursday)
    expect(validateSchedule({ pickupDate: day61, pickupWindow: 'morning', tier: 'standard' }, now)).toMatchObject({ ok: false });
    expect(validateSchedule({ pickupDate: day61, pickupWindow: 'morning', tier: 'standard', extraDaysAhead: 1 }, now)).toEqual({ ok: true });
  });
});

describe('Territories in Mission Control', () => {
  it('lists territories with founders and ZIPs, moves a ZIP, and adds a territory', async () => {
    db.founding_members = [{ territory_id: '1D', number: 1, customer_id: 'a', ended_at: null }];
    const view = await (await territoriesGET(new Request('http://localhost/api/mission-control/territories'))).json();
    expect(view.territories[0]).toMatchObject({ id: '1D', zips: ['75024'], founders: 1, activeFounders: 1 });
    // Zone 1-4 ZIPs that aren't in a territory are listed
    expect(view.unassigned.length).toBeGreaterThan(0);
    const post = (body: Row) => territoriesPOST(new Request('http://localhost/api/mission-control/territories', { method: 'POST', body: JSON.stringify(body) }));
    expect((await post({ action: 'assign_zip', zip: '75209', territory_id: '1D' })).status).toBe(200);
    expect(db.territory_zips).toContainEqual({ zip: '75209', territory_id: '1D' });
    expect((await post({ action: 'create', id: '1i', name: 'Uptown', zone_id: 'zone_1' })).status).toBe(200);
    expect(db.territories).toContainEqual({ id: '1I', name: 'Uptown', zone_id: 'zone_1' });
    expect((await post({ action: 'create', id: '1D', name: 'Again', zone_id: 'zone_1' })).status).toBe(409);
    expect(audit.map((a) => a.action)).toEqual(['territory.assign_zip', 'territory.create']);
  });

  it("the client's starting list is seeded: 19 territories, 117 ZIPs", () => {
    const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '20261010_referrals_founding_tiers.sql'), 'utf8');
    const seed = sql.slice(sql.indexOf('INSERT INTO territory_zips'), sql.indexOf('ON CONFLICT (zip) DO NOTHING'));
    expect(seed.match(/\('\d{5}', '[0-9A-Z]+'\)/g)).toHaveLength(117);
    const territories = sql.slice(sql.indexOf('INSERT INTO territories'), sql.indexOf('ON CONFLICT (id) DO NOTHING'));
    expect(territories.match(/\('[0-9A-Z]+', '/g)).toHaveLength(19);
  });
});
