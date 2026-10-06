import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Post-audit follow-up to PR-14: the board asked for the newest 50 orders of
// any status, so once more than 50 orders existed an older order still being
// worked on fell off the board. The board view now loads every active order
// (with a safety cap it reports) plus the latest delivered ones for the archive.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Call = { filters: Array<[string, unknown]>; limit?: number; order?: string };
const calls: Call[] = [];
let activeRows: Row[] = [];
let activeCount = 0;
let deliveredRows: Row[] = [];

function builder() {
  const call: Call = { filters: [] };
  calls.push(call);
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (k: string, v: unknown) => (call.filters.push([`eq:${k}`, v]), b),
    in: (k: string, v: unknown) => (call.filters.push([`in:${k}`, v]), b),
    order: (col: string) => ((call.order = col), b),
    range: (from: number, to: number) => ((call.limit = to - from + 1), b),
    limit: (n: number) => ((call.limit = n), b),
    then: (resolve: (r: unknown) => unknown) => {
      const delivered = call.filters.some(([k, v]) => k === 'eq:status' && v === 'delivered');
      const data = delivered ? deliveredRows : activeRows;
      return Promise.resolve({ data, count: delivered ? data.length : activeCount, error: null }).then(resolve);
    },
  };
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => (t === 'orders' ? builder() : { select: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }),
    rpc: async () => ({ data: { total_count: 900 }, error: null }),
  }),
}));
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: { id: 'admin-1', role: 'admin' }, user: {} }),
}));
vi.mock('@/lib/storage', () => ({ withSignedPhotoUrls: async <T,>(v: T) => v }));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: vi.fn() } }));

import { GET } from '@/app/api/mission-control/route';

const ACTIVE = ['booked', 'picked_up', 'weighed_itemized', 'in_cleaning', 'out_for_delivery'];

beforeEach(() => {
  calls.length = 0;
  activeRows = [];
  activeCount = 0;
  deliveredRows = [];
});

const board = async () => (await GET(new Request('http://localhost/api/mission-control?view=board'))).json();

describe('Mission Control board shows every active order', () => {
  it('loads all active stages (not just the newest 50) plus recent deliveries', async () => {
    activeRows = Array.from({ length: 120 }, (_, i) => ({ id: `a${i}`, status: 'booked' }));
    activeCount = 120;
    deliveredRows = [{ id: 'd1', status: 'delivered' }];
    const body = await board();

    const active = calls.find((c) => c.filters.some(([k]) => k === 'in:status'))!;
    expect(active.filters).toContainEqual(['in:status', ACTIVE]);
    expect(active.limit).toBe(500);
    const archive = calls.find((c) => c.filters.some(([k, v]) => k === 'eq:status' && v === 'delivered'))!;
    expect(archive.limit).toBe(100);

    expect(body.orders).toHaveLength(121);
    expect(body.active_truncated).toBe(false);
  });

  it('says so when there are more active orders than the safety cap', async () => {
    activeRows = Array.from({ length: 500 }, (_, i) => ({ id: `a${i}`, status: 'in_cleaning' }));
    activeCount = 640;
    const body = await board();
    expect(body.active_truncated).toBe(true);
    expect(body.active_total).toBe(640);
  });

  it('the dashboard asks for the board view', async () => {
    const { readFileSync } = await import('node:fs');
    const hook = readFileSync('src/hooks/useMissionControl.ts', 'utf8');
    expect(hook).toContain("params.set('view', 'board')");
  });
});
