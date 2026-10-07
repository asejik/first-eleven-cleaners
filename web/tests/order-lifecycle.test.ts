import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-02: order stages are enforced on the server. Intake is the only place a card
// is charged, so no route may skip it or move an unpaid order into cleaning.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Write = { table: string; op: 'insert' | 'update' | 'delete'; values: Row; filters: Row };
const writes: Write[] = [];
let orderFixture: Row | null = null;

function builder(table: string) {
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  let current: Write | null = null;
  const filters: Row = {};
  const result = () => {
    if (op === 'update' && table === 'orders') {
      // Honour conditional updates: .eq('status', x) only matches when the order is in x
      const matches = !orderFixture || filters.status === undefined || orderFixture.status === filters.status;
      return { data: matches ? [{ id: 'order-1' }] : [], error: null };
    }
    if (op !== 'select') return { data: [{ id: `${table}-row` }], error: null };
    return { data: table === 'orders' ? orderFixture : null, error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (v: Row) => {
      op = 'insert';
      current = { table, op, values: v, filters };
      writes.push(current);
      return b;
    },
    update: (v: Row) => {
      op = 'update';
      current = { table, op, values: v, filters };
      writes.push(current);
      return b;
    },
    delete: () => {
      op = 'delete';
      current = { table, op, values: {}, filters };
      writes.push(current);
      return b;
    },
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return b;
    },
    neq: () => b,
    or: () => b,
    in: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: async () => result(),
    single: async () => result(),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return b;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}));

let authCustomer: Row = { id: 'admin-1', full_name: 'Ops Admin', role: 'admin' };
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: authCustomer, user: { id: authCustomer.id } }),
}));

const dispatch = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/messaging', () => ({
  messagingService: { dispatchStageNotification: () => dispatch() },
}));
vi.mock('@/lib/storage', () => ({
  // Mirrors lib/storage: a photo that can't be stored resolves to null (PR-06)
  resolveAndUploadPhotoUrl: async (url: string) => (url.startsWith('data:') ? null : url),
  withSignedPhotoUrls: async <T,>(v: T) => v,
}));
vi.mock('@/lib/express', () => ({
  handleExpressDeliverySLA: async () => ({ isExpress: false, isMissedSLA: false }),
}));

import { POST as missionControlPOST } from '@/app/api/mission-control/route';
import { POST as driverPOST } from '@/app/api/driver/route';
import { POST as intakePOST } from '@/app/api/intake/route';

const ORDER_ID = '11111111-2222-3333-4444-555555555555';

function order(overrides: Row = {}): Row {
  return {
    id: ORDER_ID,
    order_number: 'F11-2026-LIFE0001',
    status: 'booked',
    order_type: 'dry_clean',
    payment_status: 'authorized',
    payment_id: null,
    total: 50,
    customer: { id: 'cust-1', full_name: 'Life Cycle', phone: '+12145550100', email: 'life@example.com' },
    photos: [],
    events: [],
    ...overrides,
  };
}

function post(url: string, body: Row) {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

const advance = (body: Row) =>
  missionControlPOST(post('http://localhost/api/mission-control', { action: 'advance_stage', order_id: ORDER_ID, ...body }));
const driver = (body: Row) => driverPOST(post('http://localhost/api/driver', { order_id: ORDER_ID, ...body }));
const intake = (body: Row = {}) =>
  intakePOST(post('http://localhost/api/intake', { order_id: ORDER_ID, weight_lbs: 0, dry_clean_items: [{ garment_type: 'shirt_blouse', quantity: 2 }], ...body }));

const statusUpdates = () => writes.filter((w) => w.table === 'orders' && w.op === 'update' && 'status' in w.values);

beforeEach(() => {
  writes.length = 0;
  dispatch.mockClear();
  orderFixture = null;
  authCustomer = { id: 'admin-1', full_name: 'Ops Admin', role: 'admin' };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
  delete process.env.SQUARE_ACCESS_TOKEN;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Mission Control stage changes (PR-02)', () => {
  it('cannot move a picked-up bag to Weighed & Itemized without intake', async () => {
    orderFixture = order({ status: 'picked_up' });
    const res = await advance({ new_stage: 'weighed_itemized' });
    expect(res.status).toBe(409);
    expect(statusUpdates()).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('lets a Payment Needed order into cleaning: only delivery waits for payment (client 2026-10-06, Part A)', async () => {
    orderFixture = order({ status: 'weighed_itemized', payment_status: 'failed' });
    const res = await advance({ new_stage: 'in_cleaning' });
    expect(res.status).toBe(200);
    expect(statusUpdates()).toHaveLength(1);
  });

  it('cannot send an unpaid order out for delivery without a manager override', async () => {
    orderFixture = order({ status: 'in_cleaning', payment_status: 'failed' });
    const res = await advance({ new_stage: 'out_for_delivery' });
    expect(res.status).toBe(400);
    expect(statusUpdates()).toHaveLength(0);
  });

  it('allows a charged order into cleaning', async () => {
    orderFixture = order({ status: 'weighed_itemized', payment_status: 'charged' });
    const res = await advance({ new_stage: 'in_cleaning' });
    expect(res.status).toBe(200);
    expect(statusUpdates()).toHaveLength(1);
    expect(statusUpdates()[0].filters.status).toBe('weighed_itemized');
  });

  it('allows an uncharged order forward only with a logged manager override', async () => {
    orderFixture = order({ status: 'in_cleaning', payment_status: 'failed' });
    const res = await advance({ new_stage: 'out_for_delivery', manager_override: true, override_reason: 'Paid by phone' });
    expect(res.status).toBe(200);
    const override = writes.find((w) => w.table === 'order_events' && String(w.values.note).includes('MANAGER OVERRIDE'));
    expect(override).toBeTruthy();
  });

  it('rejects skipping stages and moving backwards', async () => {
    orderFixture = order({ status: 'booked' });
    expect((await advance({ new_stage: 'delivered' })).status).toBe(409);
    orderFixture = order({ status: 'delivered', payment_status: 'charged' });
    expect((await advance({ new_stage: 'booked' })).status).toBe(409);
    expect(statusUpdates()).toHaveLength(0);
  });

  it('rejects an unknown stage name', async () => {
    orderFixture = order({ status: 'booked' });
    const res = await advance({ new_stage: 'teleported' });
    expect(res.status).toBe(400);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not notify the customer when the order changed underneath (double click)', async () => {
    // The board thinks it is booked, but another click already moved it on
    orderFixture = order({ status: 'booked' });
    const first = await advance({ new_stage: 'picked_up' });
    expect(first.status).toBe(200);
    orderFixture = { ...order({ status: 'booked' }), status: 'picked_up' };
    dispatch.mockClear();
    const res = await advance({ new_stage: 'picked_up' });
    expect(res.status).toBe(409);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('Driver actions (PR-02)', () => {
  beforeEach(() => {
    authCustomer = { id: 'driver-1', full_name: 'Dana Driver', role: 'driver' };
  });

  it('cannot load an order that has not finished cleaning', async () => {
    orderFixture = order({ status: 'picked_up' });
    const res = await driver({ action: 'load_for_delivery' });
    expect(res.status).toBe(409);
    expect(statusUpdates()).toHaveLength(0);
  });

  it('cannot deliver an order that is not out for delivery', async () => {
    orderFixture = order({ status: 'booked' });
    const res = await driver({ action: 'delivery_complete', photo_url: 'https://example.com/p.jpg' });
    expect(res.status).toBe(409);
    expect(statusUpdates()).toHaveLength(0);
  });

  it('delivers an order that is out for delivery', async () => {
    orderFixture = order({
      status: 'out_for_delivery',
      payment_status: 'charged',
      events: [{ status: 'out_for_delivery', triggered_by: 'Driver (Dana Driver [driver-1])' }],
    });
    const res = await driver({ action: 'delivery_complete', photo_url: 'https://example.com/p.jpg' });
    expect(res.status).toBe(200);
    expect(statusUpdates()[0].filters.status).toBe('out_for_delivery');
  });

  it('pickup only applies to a booked order (conditional update)', async () => {
    orderFixture = order({ status: 'booked' });
    const res = await driver({ action: 'pickup_complete', photo_url: 'https://example.com/p.jpg' });
    expect(res.status).toBe(200);
    expect(statusUpdates()[0].filters.status).toBe('booked');
  });
});

describe('Intake (PR-02)', () => {
  beforeEach(() => {
    authCustomer = { id: 'intake-1', full_name: 'Ivy Intake', role: 'intake_staff' };
  });

  it('runs on a picked-up bag', async () => {
    orderFixture = order({ status: 'picked_up' });
    const res = await intake();
    expect(res.status).toBe(200);
  });

  it('refuses delivered, cancelled and already-paid orders', async () => {
    for (const fixture of [
      order({ status: 'delivered', payment_status: 'charged' }),
      order({ status: 'cancelled', payment_status: 'authorized' }),
      order({ status: 'in_cleaning', payment_status: 'charged' }),
      order({ status: 'weighed_itemized', payment_status: 'charged' }),
    ]) {
      orderFixture = fixture;
      const res = await intake();
      expect(res.status).toBe(409);
    }
    expect(statusUpdates()).toHaveLength(0);
    expect(writes.filter((w) => w.table === 'order_items')).toHaveLength(0);
  });

  it('allows a re-weigh while payment is still on hold', async () => {
    orderFixture = order({ status: 'weighed_itemized', payment_status: 'failed' });
    const res = await intake();
    expect(res.status).toBe(200);
  });
});

describe('Intake pricing for wash & fold (PR-03)', () => {
  beforeEach(() => {
    authCustomer = { id: 'intake-1', full_name: 'Ivy Intake', role: 'intake_staff' };
  });

  const orderUpdate = () => writes.find((w) => w.table === 'orders' && w.op === 'update' && 'subtotal' in w.values);
  const itemInserts = () => writes.filter((w) => w.table === 'order_items' && w.op === 'insert');

  it('does not bill laundry on a "Both" order when no laundry was weighed', async () => {
    orderFixture = order({ status: 'picked_up', order_type: 'mixed' });
    const res = await intake({ weight_lbs: 0, dry_clean_items: [{ garment_type: 'shirt_blouse', quantity: 2 }] });
    expect(res.status).toBe(200);
    expect(orderUpdate()?.values.subtotal).toBe(17.98);
  });

  it('bills the 15 lb minimum when some laundry was weighed, and lists it on the receipt', async () => {
    orderFixture = order({ status: 'picked_up', order_type: 'mixed' });
    const res = await intake({ weight_lbs: 10, dry_clean_items: [{ garment_type: 'shirt_blouse', quantity: 2 }] });
    expect(res.status).toBe(200);
    expect(orderUpdate()?.values.subtotal).toBe(62.98);
    const lines = itemInserts().flatMap((w) => (Array.isArray(w.values) ? w.values : [w.values])) as Row[];
    const laundry = lines.find((l) => l.service_type === 'wash_fold');
    expect(laundry).toMatchObject({ garment_type: 'wash_fold', subtotal: 45 });
  });

  it('rejects a negative or non-numeric weight', async () => {
    orderFixture = order({ status: 'picked_up', order_type: 'wash_fold' });
    expect((await intake({ weight_lbs: -5, dry_clean_items: [] })).status).toBe(400);
    expect((await intake({ weight_lbs: 'heavy', dry_clean_items: [] })).status).toBe(400);
    expect(orderUpdate()).toBeUndefined();
  });
});

describe('Driver proof photos (PR-06)', () => {
  beforeEach(() => {
    authCustomer = { id: 'driver-1', full_name: 'Dana Driver', role: 'driver' };
  });

  it('does not confirm a pickup when the proof photo could not be saved', async () => {
    orderFixture = order({ status: 'booked' });
    const res = await driver({ action: 'pickup_complete', photo_url: 'data:image/jpeg;base64,AAAA' });
    expect(res.status).toBe(502);
    expect(statusUpdates()).toHaveLength(0);
    expect(writes.filter((w) => w.table === 'garment_photos')).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not confirm a delivery when the proof photo could not be saved', async () => {
    orderFixture = order({
      status: 'out_for_delivery',
      payment_status: 'charged',
      events: [{ status: 'out_for_delivery', triggered_by: 'Driver (Dana Driver [driver-1])' }],
    });
    const res = await driver({ action: 'delivery_complete', photo_url: 'data:image/jpeg;base64,AAAA' });
    expect(res.status).toBe(502);
    expect(statusUpdates()).toHaveLength(0);
  });
});
