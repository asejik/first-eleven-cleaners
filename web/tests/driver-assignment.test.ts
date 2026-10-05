import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-19: which van holds an order is a real column (orders.assigned_driver_id),
// claimed atomically, not guessed from driver names in event notes.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Update = { values: Row; filters: Row; orFilter: string | null };
let orderFixture: Row | null = null;
let activeOrders: Row[] = [];
const updates: Update[] = [];
let claimWins = true; // whether the conditional claim update matches a row

function builder(table: string) {
  const filters: Row = {};
  let orFilter: string | null = null;
  let updateValues: Row | null = null;
  const b: Record<string, unknown> = {
    select: () => b,
    insert: async () => ({ error: null }),
    update: (v: Row) => {
      updateValues = v;
      return b;
    },
    eq: (k: string, v: unknown) => {
      filters[k] = v;
      return b;
    },
    or: (f: string) => {
      orFilter = f;
      return b;
    },
    in: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: async () => ({ data: table === 'orders' ? orderFixture : null, error: null }),
    then: (resolve: (r: unknown) => unknown) => {
      if (updateValues) {
        updates.push({ values: updateValues, filters: { ...filters }, orFilter });
        const isClaim = 'assigned_driver_id' in updateValues;
        return Promise.resolve({ data: !isClaim || claimWins ? [{ id: 'o1' }] : [], error: null }).then(resolve);
      }
      const data = table === 'orders' ? (filters.status === 'delivered' ? [] : activeOrders) : [];
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }));

let authCustomer: Row = {};
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: authCustomer, user: { id: authCustomer.id } }),
}));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: vi.fn(async () => ({})) } }));
vi.mock('@/lib/storage', () => ({
  resolveAndUploadPhotoUrl: async (u: string) => u,
  withSignedPhotoUrls: async <T,>(v: T) => v,
}));
vi.mock('@/lib/express', () => ({ handleExpressDeliverySLA: async () => ({ isExpress: false, isMissedSLA: false }) }));

import { GET, POST } from '@/app/api/driver/route';

const DANA_A = { id: 'aaaaaaaa-0000-0000-0000-000000000001', full_name: 'Dana Smith', role: 'driver' };
const DANA_B = { id: 'bbbbbbbb-0000-0000-0000-000000000002', full_name: 'Dana Jones', role: 'driver' };
const ORDER_ID = '11111111-2222-3333-4444-555555555555';

const order = (overrides: Row = {}): Row => ({
  id: ORDER_ID,
  order_number: 'F11-2026-VAN00001',
  status: 'out_for_delivery',
  payment_status: 'charged',
  assigned_driver_id: null,
  customer: { full_name: 'Pat', phone: '+12145550100' },
  photos: [],
  events: [],
  ...overrides,
});
const post = (body: Row) =>
  POST(new Request('http://localhost/api/driver', { method: 'POST', body: JSON.stringify({ order_id: ORDER_ID, ...body }) }));

beforeEach(() => {
  updates.length = 0;
  claimWins = true;
  authCustomer = DANA_A;
  orderFixture = order();
  activeOrders = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Van assignment (PR-19)', () => {
  it('loading claims the order for this driver with one conditional update', async () => {
    const res = await post({ action: 'load_for_delivery' });
    expect(res.status).toBe(200);
    const claim = updates.find((u) => 'assigned_driver_id' in u.values);
    expect(claim?.values.assigned_driver_id).toBe(DANA_A.id);
    expect(claim?.orFilter).toContain('assigned_driver_id.is.null');
  });

  it('a second driver loading at the same moment is refused', async () => {
    claimWins = false; // the other van's claim landed first
    const res = await post({ action: 'load_for_delivery' });
    expect(res.status).toBe(409);
  });

  it('a driver with the same first name cannot deliver another van\'s order', async () => {
    orderFixture = order({
      assigned_driver_id: DANA_A.id,
      events: [{ status: 'out_for_delivery', triggered_by: `Driver (Dana Smith [${DANA_A.id}])` }],
    });
    authCustomer = DANA_B;
    const res = await post({ action: 'delivery_complete', photo_url: 'https://example.com/p.jpg' });
    expect(res.status).toBe(403);
  });

  it('the manifest lists an assigned order only in that driver\'s van', async () => {
    activeOrders = [order({ assigned_driver_id: DANA_A.id })];
    const forA = await (await GET(new Request('http://localhost/api/driver'))).json();
    expect(forA.deliveries).toHaveLength(1);
    expect(forA.ready_at_plant).toHaveLength(0);

    authCustomer = DANA_B;
    const forB = await (await GET(new Request('http://localhost/api/driver'))).json();
    expect(forB.deliveries).toHaveLength(0);
    expect(forB.ready_at_plant).toHaveLength(0);
  });
});
