import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-13: "today" on the server and staff screens is Dallas time, not UTC.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
let ordersFixture: Row[] = [];

function builder(table: string) {
  const result = () => ({ data: table === 'orders' ? ordersFixture : [], count: ordersFixture.length, error: null });
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    in: () => b,
    order: () => b,
    limit: () => b,
    range: () => b,
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return b;
}

const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => builder(table),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { data: { today_sales: 80 }, error: null };
    },
  }),
}));
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: { id: 'admin-1', full_name: 'Ops Admin', role: 'admin' }, user: {} }),
}));
vi.mock('@/lib/storage', () => ({ withSignedPhotoUrls: async <T,>(v: T) => v }));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: vi.fn() } }));

import { texasDate, addDaysToDate, dayOfWeek } from '@/lib/texas-time';
import { GET as missionControlGET } from '@/app/api/mission-control/route';

// 9:00 PM Central on Monday 2026-10-05 is already 02:00 UTC on Tuesday
const EVENING_IN_DALLAS = new Date('2026-10-06T02:00:00Z');

beforeEach(() => {
  process.env.TZ = 'UTC';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(EVENING_IN_DALLAS);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Dallas calendar helpers (PR-13)', () => {
  it('is still Monday in Dallas at 9 PM Central', () => {
    expect(texasDate()).toBe('2026-10-05');
    expect(texasDate('2026-10-05T20:00:00Z')).toBe('2026-10-05');
  });

  it('does calendar arithmetic without time-zone drift', () => {
    expect(addDaysToDate('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToDate('2026-03-07', 1)).toBe('2026-03-08'); // across the DST change
    expect(dayOfWeek('2026-10-04')).toBe(0);
    expect(dayOfWeek('2026-10-05')).toBe(1);
  });
});

describe("Mission Control's today figures use Dallas time (PR-13)", () => {
  it("asks for this evening's Dallas date, not tomorrow's UTC date", async () => {
    // The day boundary itself is applied in SQL (mission_control_summary, PR-14)
    rpcCalls.length = 0;
    const res = await missionControlGET(new Request('http://localhost/api/mission-control'));
    const body = await res.json();
    expect(rpcCalls[0]).toEqual({ fn: 'mission_control_summary', args: { p_today: '2026-10-05' } });
    expect(body.stats.today_revenue).toBe(80);
  });
});
