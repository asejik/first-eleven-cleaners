import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client 2026-10-06, Part A: the receipt carries the ticket and photos with two
// taps ("Looks good" / "Something's off" -> Make It Right), the Delivered message
// has a next-pickup tap, and a cancelled pickup releases its card hold.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const writes: Array<{ table: string; op: string; values: Row }> = [];
let orderFixture: Row | null = null;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let op = 'select';
      const b: Record<string, unknown> = {
        select: () => b,
        insert: (v: Row) => {
          op = 'insert';
          writes.push({ table, op, values: v });
          return b;
        },
        update: (v: Row) => {
          op = 'update';
          writes.push({ table, op, values: v });
          return b;
        },
        eq: () => b,
        maybeSingle: async () => ({ data: table === 'orders' ? orderFixture : null, error: null }),
        then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return b;
    },
  }),
}));
const reportError = vi.fn();
vi.mock('@/lib/error-reporting', () => ({ reportError: (...args: unknown[]) => reportError(...args) }));

import { POST as feedbackPOST } from '@/app/api/orders/[id]/feedback/route';
import { formatStageMessage } from '@/lib/messaging/templates';
import { releaseOrderHold } from '@/lib/payment-capture';
import { createAdminClient } from '@/lib/supabase/admin';

const ORDER_ID = '58046cf5-aa31-47bf-853f-d6bebe06a2c6';
let ipCounter = 0;
const feedback = (body: unknown, id = ORDER_ID) =>
  feedbackPOST(
    new Request(`http://localhost/api/orders/${id}/feedback`, {
      method: 'POST',
      // A fresh network per request, so the per-network limit doesn't bleed between tests
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `198.51.100.${++ipCounter}` },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );

beforeEach(() => {
  writes.length = 0;
  reportError.mockClear();
  orderFixture = { id: ORDER_ID, order_number: 'F11-2026-TICKET', status: 'weighed_itemized', customer_id: 'cust-1' };
});

describe('"Looks good" / "Something\'s off" on the itemized ticket', () => {
  it('"Looks good" closes the loop on the order timeline', async () => {
    const res = await feedback({ response: 'looks_good' });
    expect(res.status).toBe(200);
    expect(writes).toContainEqual(
      expect.objectContaining({ table: 'order_events', values: expect.objectContaining({ status: 'customer_feedback', note: expect.stringContaining('looks good') }) })
    );
    expect(writes.some((w) => w.table === 'claims')).toBe(false);
  });

  it('"Something\'s off" opens a Make It Right claim and alerts an admin the same day', async () => {
    const res = await feedback({ response: 'something_off', message: 'One shirt is missing from the ticket.' });
    expect(res.status).toBe(200);
    expect((await res.json()).message).toContain('Make It Right');
    expect(writes).toContainEqual(
      expect.objectContaining({
        table: 'claims',
        op: 'insert',
        values: expect.objectContaining({ order_id: ORDER_ID, customer_id: 'cust-1', issue_type: 'other', description: expect.stringContaining('One shirt is missing') }),
      })
    );
    expect(reportError).toHaveBeenCalledWith('make-it-right/ticket', expect.any(String), expect.objectContaining({ alert: true }));
  });

  it('needs a short description for "Something\'s off"', async () => {
    const res = await feedback({ response: 'something_off', message: '' });
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it('works only through the private tracking link (the order UUID), not an order number', async () => {
    expect((await feedback({ response: 'looks_good' }, 'F11-2026-TICKET')).status).toBe(404);
  });

  it('waits until the order has an itemized ticket', async () => {
    orderFixture = { ...orderFixture, status: 'booked' };
    expect((await feedback({ response: 'looks_good' })).status).toBe(409);
  });

  it('the tracking page shows the two taps once the order is itemized', () => {
    const page = readFileSync(join(__dirname, '..', 'src', 'app', 'track', '[orderId]', 'page.tsx'), 'utf8');
    expect(page).toContain('<TicketFeedbackCard orderId={order.id} ticket={order.ticket} />');
  });
});

describe('Receipt and Delivered messages', () => {
  const base = {
    orderId: ORDER_ID,
    orderNumber: 'F11-2026-TICKET',
    customerName: 'Ada Lovelace',
    customerPhone: '+12145550100',
    trackingUrl: `https://www.firstelevencleaners.com/track/${ORDER_ID}`,
  };

  it('the receipt says what was charged and offers the two taps with the ticket link', () => {
    const msg = formatStageMessage({ ...base, stage: 'weighed_itemized', total: 71.32, itemCount: 4 });
    expect(msg.smsBody).toContain("We've charged $71.32 to your card");
    expect(msg.smsBody).toContain('Looks good');
    expect(msg.smsBody).toContain("Something's off");
    expect(msg.smsBody).toContain(base.trackingUrl);
  });

  it('the Delivered message has a next-pickup tap', () => {
    const msg = formatStageMessage({ ...base, stage: 'delivered' });
    expect(msg.smsBody).toContain('Book your next pickup: https://www.firstelevencleaners.com/book');
  });

  it('a Payment Needed message gets its own title, not the Express one', () => {
    const msg = formatStageMessage({ ...base, stage: 'weighed_itemized', customMessage: 'Card declined', customTitle: '💳 Payment Needed' });
    expect(msg.title).toBe('💳 Payment Needed');
  });
});

describe('Cancelling a pickup releases its card hold', () => {
  const originalEnv = { ...process.env };
  let squarePaths: string[] = [];
  beforeEach(() => {
    process.env.SQUARE_ACCESS_TOKEN = 'EAAAtest-sandbox-token';
    process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID = 'LOC123';
    process.env.SQUARE_ENVIRONMENT = 'sandbox';
    squarePaths = [];
    vi.stubGlobal('fetch', async (input: string) => {
      squarePaths.push(String(input).replace(/^https:\/\/connect\.squareupsandbox\.com\/v2/, ''));
      return new Response(JSON.stringify({ payment: { status: 'CANCELED' } }), { status: 200 });
    });
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  const supabase = () => createAdminClient() as unknown as Parameters<typeof releaseOrderHold>[0];

  it('cancels a placed hold with Square and marks it released', async () => {
    await releaseOrderHold(supabase(), { id: ORDER_ID, hold_payment_id: 'HOLD_1', hold_status: 'held' }, 'test');
    expect(squarePaths).toEqual(['/payments/HOLD_1/cancel']);
    expect(writes).toContainEqual(expect.objectContaining({ table: 'orders', values: expect.objectContaining({ hold_status: 'released' }) }));
  });

  it('just marks a scheduled hold released (nothing was placed with Square)', async () => {
    await releaseOrderHold(supabase(), { id: ORDER_ID, hold_payment_id: null, hold_status: 'scheduled' }, 'test');
    expect(squarePaths).toHaveLength(0);
    expect(writes).toContainEqual(expect.objectContaining({ table: 'orders', values: expect.objectContaining({ hold_status: 'released' }) }));
  });

  it('does nothing for an order with no hold', async () => {
    await releaseOrderHold(supabase(), { id: ORDER_ID, hold_status: 'none' }, 'test');
    expect(squarePaths).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });

  it('both cancel paths release the hold', () => {
    const src = (rel: string) => readFileSync(join(__dirname, '..', 'src', ...rel.split('/')), 'utf8');
    expect(src('app/api/orders/[id]/route.ts')).toContain("releaseOrderHold(supabase, order, 'pickup cancelled by the customer')");
    expect(src('app/api/mission-control/route.ts')).toContain("releaseOrderHold(supabase, order, 'pickup cancelled from Mission Control')");
  });
});
