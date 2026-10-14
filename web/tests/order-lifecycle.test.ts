import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-02: order stages are enforced on the server. Intake is the only place a card
// is charged, so no route may skip it or move an unpaid order into cleaning.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Write = { table: string; op: 'insert' | 'update' | 'delete'; values: Row; filters: Row };
const writes: Write[] = [];
let orderFixture: Row | null = null;
// The Match-Ready Check (client 2026-10-14): finished by default (items 1-10 and a return photo)
const FULL_CHECK = Array.from({ length: 10 }, (_, i) => ({ item: i + 1, note: null }));
let checksFixture: Row[] = FULL_CHECK;
let photosFixture: Row[] = [{ photo_type: 'return', photo_url: 'https://example.com/r.jpg' }];

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
    if (op !== 'select') return { data: [{ id: `${table}-row`, order_number: 'F11-2026-LIFE0001' }], error: null };
    if (table === 'match_ready_checks') return { data: checksFixture, error: null };
    if (table === 'garment_photos') return { data: photosFixture, error: null };
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
    upsert: (v: Row) => {
      op = 'insert';
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
import { POST as matchReadyPOST } from '@/app/api/orders/[id]/match-ready/route';
import { summarizeMatchReady, checkMatchReadyGate, checkTickAllowed, MATCH_READY_ITEMS } from '@/lib/match-ready';
import { formatStageMessage } from '@/lib/messaging/templates';

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
  checksFixture = FULL_CHECK;
  photosFixture = [{ photo_type: 'return', photo_url: 'https://example.com/r.jpg' }];
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
    orderFixture = order({ status: 'match_ready_check', payment_status: 'failed' });
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
    orderFixture = order({ status: 'match_ready_check', payment_status: 'failed' });
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
    const res = await driver({ action: 'delivery_complete', photo_url: 'https://example.com/p.jpg', sealed: true });
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
    const res = await driver({ action: 'delivery_complete', photo_url: 'data:image/jpeg;base64,AAAA', sealed: true });
    expect(res.status).toBe(502);
    expect(statusUpdates()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Client 2026-10-14: the 11-point Match-Ready Check as a real gate. Intake does 1-5 when the
// bag comes in and 6-10 when it's back from the plant; the driver does 11 at the door. The
// order can't go out for delivery until 1-10 are done and the return photo is attached,
// unless the owner overrides it with a logged reason.
// ---------------------------------------------------------------------------
describe('Match-Ready Check rules', () => {
  const ticked = (...items: number[]) => items.map((item) => ({ item }));
  const returnPhoto = [{ photo_type: 'return' }];

  it("has the client's 11 items in three places", () => {
    expect(MATCH_READY_ITEMS).toHaveLength(11);
    expect(MATCH_READY_ITEMS.map((i) => i.phase)).toEqual([...Array(5).fill('intake'), ...Array(5).fill('return'), 'door']);
    expect(MATCH_READY_ITEMS[1].label).toBe('Pockets checked, anything found photographed and bagged');
    expect(MATCH_READY_ITEMS[10].label).toBe('Sealed in the First Eleven bag, delivery photo taken');
  });

  it('ready only with items 1-10 and the return photo; passed with 11 too', () => {
    expect(summarizeMatchReady(ticked(1, 2, 3, 4, 5, 6, 7, 8, 9), returnPhoto)).toMatchObject({ ready: false, missing: [10] });
    expect(summarizeMatchReady(ticked(1, 2, 3, 4, 5, 6, 7, 8, 9, 10), [])).toMatchObject({ ready: false, returnPhoto: false });
    expect(summarizeMatchReady(ticked(1, 2, 3, 4, 5, 6, 7, 8, 9, 10), returnPhoto)).toMatchObject({ ready: true, passed: false });
    expect(summarizeMatchReady(ticked(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11), returnPhoto)).toMatchObject({ ready: true, passed: true });
  });

  it('orders weighed before the check began only need 6-10', () => {
    expect(summarizeMatchReady(ticked(6, 7, 8, 9, 10), returnPhoto, { exempt: true }).ready).toBe(true);
    expect(summarizeMatchReady(ticked(6, 7, 8, 9, 10), returnPhoto).missing).toEqual([1, 2, 3, 4, 5]);
  });

  it("the gate opens when ready, or with the owner's reason", () => {
    const notReady = summarizeMatchReady(ticked(1, 2), []);
    expect(checkMatchReadyGate(notReady, null)).toMatchObject({ ok: false });
    expect(checkMatchReadyGate(notReady, 'Plant photo app down')).toEqual({ ok: true, override: true });
  });

  it('pocket and stain items need a photo when something was found; 6-10 wait for the plant', () => {
    expect(checkTickAllowed(2, 'picked_up', { photos: [] })).toMatchObject({ ok: false });
    expect(checkTickAllowed(2, 'picked_up', { found: false, photos: [] })).toEqual({ ok: true });
    expect(checkTickAllowed(2, 'picked_up', { found: true, photos: [] })).toMatchObject({ ok: false, error: 'Add a photo of what was found in the pockets first.' });
    expect(checkTickAllowed(3, 'picked_up', { found: true, photos: [{ photo_type: 'stain' }] })).toEqual({ ok: true });
    expect(checkTickAllowed(6, 'in_cleaning', { photos: [] })).toMatchObject({ ok: false });
    expect(checkTickAllowed(10, 'match_ready_check', { photos: [] })).toMatchObject({ ok: false, error: 'Add a photo of the return first.' });
    expect(checkTickAllowed(10, 'match_ready_check', { photos: returnPhoto })).toEqual({ ok: true });
    expect(checkTickAllowed(11, 'out_for_delivery', { photos: [] })).toMatchObject({ ok: false });
  });
});

describe('Match-Ready Check gate (client 2026-10-14)', () => {
  it('in cleaning goes to the check, never straight out for delivery', async () => {
    orderFixture = order({ status: 'in_cleaning', payment_status: 'charged' });
    expect((await advance({ new_stage: 'out_for_delivery' })).status).toBe(409);
    const res = await advance({ new_stage: 'match_ready_check' });
    expect(res.status).toBe(200);
    // No text for the check itself
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('an unfinished check keeps the order in; the owner can override it with a logged reason', async () => {
    orderFixture = order({ status: 'match_ready_check', payment_status: 'charged' });
    checksFixture = FULL_CHECK.filter((c) => c.item !== 9);
    photosFixture = [];
    const blocked = await advance({ new_stage: 'out_for_delivery' });
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ requires_match_ready_override: true, missing: [9], return_photo: false });
    expect(statusUpdates()).toHaveLength(0);

    const override = await missionControlPOST(post('http://localhost/api/mission-control', { action: 'match_ready_override', order_id: ORDER_ID, override_reason: 'Plant photo app down' }));
    expect(override.status).toBe(200);
    expect(writes.find((w) => w.table === 'orders' && w.values.match_ready_override_reason === 'Plant photo app down')).toBeTruthy();
    expect(writes.find((w) => w.table === 'admin_audit_logs' && w.values.action === 'order.match_ready_override')).toBeTruthy();

    orderFixture = order({ status: 'match_ready_check', payment_status: 'charged', match_ready_override_reason: 'Plant photo app down' });
    expect((await advance({ new_stage: 'out_for_delivery' })).status).toBe(200);
  });

  it('a finished check sends it out', async () => {
    orderFixture = order({ status: 'match_ready_check', payment_status: 'charged' });
    expect((await advance({ new_stage: 'out_for_delivery' })).status).toBe(200);
  });

  it('intake staff make the two check moves, but nothing else and no overrides', async () => {
    authCustomer = { id: 'intake-1', full_name: 'Ivy Intake', role: 'intake_staff' };
    orderFixture = order({ status: 'in_cleaning', payment_status: 'charged' });
    expect((await advance({ new_stage: 'match_ready_check' })).status).toBe(200);
    orderFixture = order({ status: 'match_ready_check', payment_status: 'charged' });
    expect((await advance({ new_stage: 'out_for_delivery' })).status).toBe(200);
    orderFixture = order({ status: 'out_for_delivery', payment_status: 'charged' });
    expect((await advance({ new_stage: 'delivered' })).status).toBe(403);
    orderFixture = order({ status: 'match_ready_check', payment_status: 'failed' });
    expect((await advance({ new_stage: 'out_for_delivery', manager_override: true })).status).toBe(403);
    const override = await missionControlPOST(post('http://localhost/api/mission-control', { action: 'match_ready_override', order_id: ORDER_ID, override_reason: 'Because I said so' }));
    expect(override.status).toBe(403);
  });

  it('the driver ticks item 11 (sealed in the bag) to deliver, and the text links the Passport', async () => {
    orderFixture = order({
      status: 'out_for_delivery',
      payment_status: 'charged',
      events: [{ status: 'out_for_delivery', triggered_by: 'Driver (Dana Driver [driver-1])' }],
    });
    const unsealed = await driver({ action: 'delivery_complete', photo_url: 'https://example.com/p.jpg' });
    expect(unsealed.status).toBe(400);
    expect(statusUpdates()).toHaveLength(0);
    const res = await driver({ action: 'delivery_complete', photo_url: 'https://example.com/p.jpg', sealed: true });
    expect(res.status).toBe(200);
    expect(writes.find((w) => w.table === 'match_ready_checks' && w.values.item === 11)).toBeTruthy();

    const text = formatStageMessage({ orderId: ORDER_ID, orderNumber: 'F11-1', customerName: 'Dana', customerPhone: '+12145550100', stage: 'delivered', trackingUrl: 'https://firstelevencleaners.com/track/x', photoUrl: 'https://example.com/p.jpg' } as never);
    expect(text.smsBody).toContain('See your return photo and Garment Passport: https://firstelevencleaners.com/track/x');
    expect(text.mediaUrl).toBeUndefined();
  });
});

describe('Match-Ready Check at the Intake Station (client 2026-10-14)', () => {
  beforeEach(() => {
    authCustomer = { id: 'intake-1', full_name: 'Ivy Intake', role: 'intake_staff' };
  });
  const tick = (body: Row) => matchReadyPOST(post(`http://localhost/api/orders/${ORDER_ID}/match-ready`, body), { params: Promise.resolve({ id: ORDER_ID }) });

  it('ticks items 1-5 at intake; a found pocket item needs its photo', async () => {
    orderFixture = order({ status: 'picked_up' });
    photosFixture = [];
    checksFixture = [];
    expect((await tick({ item: 1, ticked: true })).status).toBe(200);
    expect(writes.find((w) => w.table === 'match_ready_checks' && w.values.item === 1)).toMatchObject({ values: { done_by: 'Ivy Intake' } });
    expect((await tick({ item: 2, ticked: true, found: true })).status).toBe(409);
    expect((await tick({ item: 2, ticked: true, found: false })).status).toBe(200);
    expect(writes.find((w) => w.table === 'match_ready_checks' && w.values.item === 2)).toMatchObject({ values: { note: 'none found' } });
  });

  it('adds a check photo to the Passport, and saves the plant ticket', async () => {
    orderFixture = order({ status: 'match_ready_check' });
    expect((await tick({ photo: { type: 'return', url: 'https://example.com/return.jpg' } })).status).toBe(200);
    expect(writes.find((w) => w.table === 'garment_photos')).toMatchObject({ values: { photo_type: 'return', photo_url: 'https://example.com/return.jpg' } });
    expect((await tick({ plant_ticket_number: '  A-1042 ' })).status).toBe(200);
    expect(writes.find((w) => w.table === 'orders' && 'plant_ticket_number' in w.values)).toMatchObject({ values: { plant_ticket_number: 'A-1042' } });
  });

  it('items 6-10 wait for the order to be back from the plant', async () => {
    orderFixture = order({ status: 'in_cleaning' });
    expect((await tick({ item: 7, ticked: true })).status).toBe(409);
  });
});
