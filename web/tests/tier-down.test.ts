import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Client 2026-10-10, tier-down: "one step at a time ($80 -> $60 -> $45), each
// step needs the 20-orders-in-4-weeks threshold again and my approval. Zone 1
// ZIPs are already at $45, so nothing to flag. Zone 5 ZIPs: flag them too, but
// the action is 'Promote to Zone 4?'". Earlier: "Never auto-raise, if a
// tiered-down ZIP falls under 10 orders in 8 weeks, just flag it for me."
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

function table(name: string) {
  type Filter = (r: Row) => boolean;
  const filters: Filter[] = [];
  let op: 'select' | 'insert' = 'select';
  let values: Row = {};
  const rows = () => (db[name] ||= []);
  const run = () => {
    if (op === 'insert') {
      rows().push({ ...values });
      return { data: null, error: null };
    }
    return { data: rows().filter((r) => filters.every((f) => f(r))), error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (v: Row) => ((op = 'insert'), (values = v), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
    gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), b),
    lte: (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), b),
    order: () => b,
    limit: () => b,
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return b;
}
const supabase = { from: table } as never;

let savedSettings: Row | null = null;
vi.mock('@/lib/coverage-settings', async () => {
  const { DEFAULT_COVERAGE_SETTINGS } = await import('@/lib/coverage');
  return {
    getCoverageSettings: async () => savedSettings ?? DEFAULT_COVERAGE_SETTINGS,
    saveCoverageSettings: async (s: Row) => void (savedSettings = s),
  };
});
const contact = vi.fn(async () => ({ ok: true }));
vi.mock('@/lib/messaging/contact', () => ({ sendContactMessage: (...a: unknown[]) => contact(...(a as [])) }));

import { buildCoverage, DEFAULT_COVERAGE_SETTINGS, resolveCoverage, type CoverageSettings } from '@/lib/coverage';
import { computeTierFlags, approveTierFlag, tierLadder, nextTier } from '@/lib/tier-down';

const NOW = new Date('2026-10-10T15:00:00Z');
const coverage = (over: Partial<CoverageSettings> = {}) => buildCoverage({ ...DEFAULT_COVERAGE_SETTINGS, ...over });
// Zone 3 Denton (76201), Zone 1 Plano (75024), Zone 2 Uptown (75201), Zone 5 Sherman (75090)
const orders = (zip: string, n: number, zone_id: string, from = '2026-09-20') =>
  Array.from({ length: n }, (_, i) => ({ pickup_date: from, zone_id, status: 'booked', address: { zip }, i }));

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  savedSettings = null;
  contact.mockClear();
});

describe('The ladder', () => {
  it('one step at a time: $100 -> $80 -> $60 -> $45, and no lower', () => {
    expect(tierLadder(coverage())).toEqual([100, 80, 60, 45]);
    expect(nextTier(100, coverage())).toBe(80);
    expect(nextTier(80, coverage())).toBe(60);
    expect(nextTier(45, coverage())).toBeNull();
  });

  it("a stepped-down ZIP's own minimum is what bookings see", () => {
    const r = resolveCoverage({ zip: '76201' }, coverage({ zipMinimums: { '76201': 60 } }));
    expect(r).toMatchObject({ status: 'served', zone: { id: 'zone_3', minimumOrder: 60 } });
    expect(resolveCoverage({ zip: '76202' }, coverage({ zipMinimums: { '76201': 60 } }))).toMatchObject({ zone: { minimumOrder: 80 } });
  });
});

describe('Flags', () => {
  it('20 orders in 4 weeks flags the next step; 19 does not; Zone 1 never', async () => {
    db.orders = [...orders('76201', 20, 'zone_3'), ...orders('75201', 19, 'zone_2'), ...orders('75024', 30, 'zone_1')];
    const flags = await computeTierFlags(supabase, coverage(), NOW);
    expect(flags).toEqual([expect.objectContaining({ zip: '76201', kind: 'tier_down', zoneId: 'zone_3', current: 80, next: 60, orders: 20 })]);
  });

  it('orders older than 4 weeks do not count', async () => {
    db.orders = orders('76201', 20, 'zone_3', '2026-09-01');
    expect(await computeTierFlags(supabase, coverage(), NOW)).toEqual([]);
  });

  it('a Zone 5 ZIP is flagged "Promote to Zone 4?"', async () => {
    db.orders = orders('75090', 22, 'zone_5');
    expect(await computeTierFlags(supabase, coverage(), NOW)).toEqual([expect.objectContaining({ zip: '75090', kind: 'promote_zone_4', orders: 22 })]);
  });

  it('each step needs the threshold again, counted from the last approval', async () => {
    db.orders = [...orders('76201', 15, 'zone_3', '2026-09-20'), ...orders('76201', 10, 'zone_3', '2026-10-05')];
    db.zip_tier_steps = [{ zip: '76201', approved_at: '2026-10-01T12:00:00Z' }];
    const settings = coverage({ zipMinimums: { '76201': 60 } });
    expect((await computeTierFlags(supabase, settings, NOW)).filter((f) => f.kind === 'tier_down')).toEqual([]);
    db.orders.push(...orders('76201', 10, 'zone_3', '2026-10-08'));
    expect((await computeTierFlags(supabase, settings, NOW)).find((f) => f.kind === 'tier_down')).toMatchObject({ current: 60, next: 45, orders: 20 });
  });

  it('never raised automatically: a quiet stepped-down ZIP is only flagged for review', async () => {
    db.orders = orders('76201', 4, 'zone_3', '2026-09-30');
    expect(await computeTierFlags(supabase, coverage({ zipMinimums: { '76201': 60 } }), NOW)).toEqual([
      expect.objectContaining({ zip: '76201', kind: 'review', current: 60, orders: 4 }),
    ]);
  });

  it('the thresholds are editable', async () => {
    db.orders = orders('76201', 12, 'zone_3');
    expect(await computeTierFlags(supabase, coverage({ tierDown: { flagOrders: 12, flagWeeks: 4, reviewOrders: 10, reviewWeeks: 8 } }), NOW)).toHaveLength(1);
  });
});

describe('Approving', () => {
  it('a step down saves the ZIP minimum, records it and tells the neighborhood', async () => {
    db.orders = orders('76201', 20, 'zone_3');
    db.addresses = [{ customer_id: 'c1', zip: '76201' }, { customer_id: 'c2', zip: '76201' }, { customer_id: 'c3', zip: '75024' }];
    db.customers = [
      { id: 'c1', full_name: 'Dana Lee', phone: '+12145550100', email: 'd@example.com', sms_consent: true, role: 'customer' },
      { id: 'c2', full_name: 'Sam', phone: null, email: 's@example.com', sms_consent: false, role: 'customer' },
    ];
    const result = await approveTierFlag(supabase, coverage(), { zip: '76201', kind: 'tier_down', by: 'owner@example.com' }, NOW);
    expect(result).toMatchObject({ ok: true, told: 2 });
    expect((savedSettings as unknown as CoverageSettings).zipMinimums).toEqual({ '76201': 60 });
    expect(db.zip_tier_steps).toEqual([expect.objectContaining({ zip: '76201', action: 'tier_down', from_minimum: 80, to_minimum: 60, orders_counted: 20 })]);
    expect(contact).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('Your neighborhood just unlocked a lower minimum: pickups in 76201 now start at $60.') }));
  });

  it('promoting a Zone 5 ZIP puts it on the Zone 4 list', async () => {
    db.orders = orders('75090', 20, 'zone_5');
    const result = await approveTierFlag(supabase, coverage(), { zip: '75090', kind: 'promote_zone_4', by: 'owner' }, NOW);
    expect(result.ok).toBe(true);
    expect((savedSettings as unknown as CoverageSettings).zipZones['75090']).toBe('zone_4');
  });

  it('a ZIP that is not eligible is refused', async () => {
    db.orders = orders('76201', 5, 'zone_3');
    expect(await approveTierFlag(supabase, coverage(), { zip: '76201', kind: 'tier_down', by: 'owner' }, NOW)).toMatchObject({ ok: false });
    expect(savedSettings).toBeNull();
  });
});
