import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: {
    customer: null as null | { id: string; role: string },
    order: null as null | Record<string, unknown>,
    lookups: [] as string[],
  },
}));

vi.mock('@/lib/supabase/auth-helpers', () => ({
  getAuthenticatedCustomer: async () => ({ customer: state.customer, user: state.customer ? {} : null }),
}));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 59 }),
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const b = {
      select: () => b,
      eq: (_col: string, value: string) => {
        state.lookups.push(`eq:${value}`);
        return b;
      },
      or: (filter: string) => {
        state.lookups.push(`or:${filter}`);
        return b;
      },
      maybeSingle: async () => ({ data: state.order, error: null }),
    };
    return {
      from: () => b,
      storage: {
        from: (bucket: string) => ({
          createSignedUrls: async (paths: string[]) => ({
            data: paths.map((p) => ({ signedUrl: `https://example.supabase.co/storage/v1/object/sign/${bucket}/${p}?token=t` })),
            error: null,
          }),
        }),
      },
    };
  },
}));

import { GET, PATCH } from '@/app/api/orders/[id]/route';

const ORDER_ID = '1089e6e9-4906-495b-9714-1a3072ceeab3';
const fullOrder = {
  id: ORDER_ID,
  order_number: 'F11-2026-F7C240FB',
  customer_id: 'cust-owner',
  status: 'in_cleaning',
  order_type: 'dry_clean',
  express_tier: 'standard',
  pickup_date: '2026-10-06',
  pickup_window: 'morning',
  delivery_date: '2026-10-08',
  delivery_window: 'morning',
  subtotal: 59.96,
  total: 56.83,
  discount_amount: 8.99,
  promo_code: 'KICKOFF15',
  payment_id: 'PAY1',
  payment_status: 'charged',
  notes: 'Gate code 1234',
  created_at: '2026-10-04T18:00:00Z',
  updated_at: '2026-10-04T19:00:00Z',
  items: [{ garment_type: 'dress', quantity: 4 }],
  events: [{ status: 'picked_up', triggered_by: 'Driver (Marcus T.)' }],
  address: { street: '100 Test St', city: 'Dallas', zip: '75205' },
  photos: [
    {
      id: 'p1',
      order_id: ORDER_ID,
      photo_type: 'delivery_proof',
      photo_url: 'https://example.supabase.co/storage/v1/object/public/garment-photos/x.jpg',
      condition_notes: 'Left at front door',
      captured_by: 'Driver (Marcus T.)',
      captured_at: '2026-10-08T09:00:00Z',
    },
  ],
};

function get(id: string) {
  return GET(new Request(`http://localhost/api/orders/${id}`), { params: Promise.resolve({ id }) });
}

const originalEnv = { ...process.env };

describe('Public order tracking exposes only the tracking view (SEC-07)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
    state.customer = null;
    state.order = { ...fullOrder };
    state.lookups = [];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns only tracking fields to a visitor with the UUID link', async () => {
    // Before intake there is no ticket yet
    state.order = { ...fullOrder, status: 'picked_up' };
    const res = await get(ORDER_ID);
    const { order } = await res.json();

    expect(res.status).toBe(200);
    expect(Object.keys(order).sort()).toEqual(
      [
        'id', 'order_number', 'status', 'order_type', 'express_tier', 'pickup_date', 'pickup_window',
        'delivery_date', 'delivery_window', 'created_at', 'updated_at', 'photos',
        // PR-04: hold flag only; the amount due appears only while the order is on Payment Hold
        'payment_hold',
      ].sort()
    );
    expect(order.payment_hold).toBe(false);
    expect(order.photos[0]).not.toHaveProperty('captured_by');
    expect(order.photos[0].photo_url).toContain('garment-photos');
    // SEC-30: photos are served as short-lived signed links, never the permanent public URL
    expect(order.photos[0].photo_url).toContain('/object/sign/');
    expect(order.photos[0].photo_url).not.toContain('/object/public/');
    const json = JSON.stringify(order);
    for (const secret of ['Gate code', 'KICKOFF15', '56.83', 'Marcus', '100 Test St', 'PAY1']) {
      expect(json).not.toContain(secret);
    }
  });

  it('shows the itemized ticket once the order is weighed, and still nothing else private (owner decision 2026-10-07)', async () => {
    state.order = { ...fullOrder, items: [{ garment_type: 'dress', quantity: 4, unit_price: 15.99, subtotal: 63.96, notes: 'private note' }] };
    const { order } = await (await get(ORDER_ID)).json();
    expect(order.ticket).toMatchObject({ total: 56.83, subtotal: 59.96, discount_amount: 8.99 });
    expect(order.ticket.items).toEqual([{ garment_type: 'dress', quantity: 4, unit_price: 15.99, subtotal: 63.96 }]);
    const json = JSON.stringify(order);
    for (const secret of ['Gate code', 'KICKOFF15', 'Marcus', '100 Test St', 'PAY1', 'private note']) {
      expect(json).not.toContain(secret);
    }
  });

  it('refuses order-number lookups from visitors who are not signed in', async () => {
    const res = await get('F11-2026-4821');
    expect(res.status).toBe(404);
    expect(state.lookups).toHaveLength(0);
  });

  it('still gives the signed-in owner full details, including by order number', async () => {
    state.customer = { id: 'cust-owner', role: 'customer' };
    const res = await get('F11-2026-F7C240FB');
    const { order } = await res.json();
    expect(res.status).toBe(200);
    expect(order.items).toHaveLength(1);
    expect(order.total).toBe(56.83);
  });

  it('forbids a different signed-in customer', async () => {
    state.customer = { id: 'someone-else', role: 'customer' };
    const res = await get(ORDER_ID);
    expect(res.status).toBe(403);
  });
});

describe('Order cancel route validates the identifier before filtering (SEC-20)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
    state.customer = { id: 'cust-owner', role: 'customer' };
    state.order = { ...fullOrder, status: 'booked' };
    state.lookups = [];
  });

  it('rejects an identifier carrying PostgREST filter syntax without querying', async () => {
    const id = 'x,customer_id.neq.null';
    const res = await PATCH(
      new Request(`http://localhost/api/orders/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(res.status).toBe(400);
    expect(state.lookups).toHaveLength(0);
  });
});
