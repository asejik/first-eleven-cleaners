import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatDeliveryDate, isDeliveryLate, deliveredOnDate } from '@/lib/order-progress';
import { fetchOrderDetail } from '@/hooks/useOrders';

// ---------------------------------------------------------------------------
// P05 AR-10: the tracking and order pages said "Order Not Found" for any failure
// (rate limit, outage, no signal), printed raw dates ("2026-10-07 (morning)"),
// always claimed "Delivered on Schedule", and judged "Delayed" on the phone's clock.
// ---------------------------------------------------------------------------
const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
const PAGES = ['src/app/track/[orderId]/page.tsx', 'src/app/dashboard/orders/[id]/page.tsx'];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Order load failures are told apart (AR-10)', () => {
  it('a failed request keeps its HTTP status, so pages can tell "not found" from "try again"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Too many' }), { status: 429 })));
    await expect(fetchOrderDetail('ord-1')).rejects.toMatchObject({ status: 429 });
  });

  it('both pages show a retry state for failures other than not-found', () => {
    for (const page of PAGES) {
      const code = src(page);
      expect(code, page).toContain('isNotFoundError');
      expect(code, page).toMatch(/couldn(&apos;|')t load this order/i);
      expect(code, page).toContain('refetch');
    }
  });
});

describe('Delivery dates read like the rest of the app (AR-10)', () => {
  it('formats the date and window', () => {
    expect(formatDeliveryDate('2026-10-07', 'morning')).toBe('Wed, Oct 7 (Morning)');
    expect(formatDeliveryDate('2026-10-07', null)).toBe('Wed, Oct 7');
    expect(formatDeliveryDate(null, 'evening')).toBe('');
  });

  it('a delivered order shows the day it was delivered, not "on schedule"', () => {
    expect(
      deliveredOnDate({
        updated_at: '2026-10-09T15:00:00Z',
        photos: [{ photo_type: 'delivery_proof', captured_at: '2026-10-08T14:30:00Z' }],
      })
    ).toBe('2026-10-08');
    expect(deliveredOnDate({ updated_at: '2026-10-09T03:00:00Z', photos: [] })).toBe('2026-10-08'); // 10 PM Dallas
    for (const page of PAGES) expect(src(page), page).not.toContain('Delivered on Schedule');
  });
});

describe('"Delayed" is judged in Dallas time (AR-10)', () => {
  const morning = { status: 'in_cleaning', delivery_date: '2026-10-07', delivery_window: 'morning' };

  it('is on time before the window closes in Dallas, whatever the phone clock says', () => {
    // 11:30 AM CDT = 16:30Z; morning orders count as late from noon Dallas
    expect(isDeliveryLate(morning, new Date('2026-10-07T16:30:00Z'))).toBe(false);
    expect(isDeliveryLate(morning, new Date('2026-10-07T17:05:00Z'))).toBe(true);
  });

  it('is late on any later Dallas day, and never for delivered or cancelled orders', () => {
    expect(isDeliveryLate(morning, new Date('2026-10-08T13:00:00Z'))).toBe(true);
    expect(isDeliveryLate({ ...morning, status: 'delivered' }, new Date('2026-10-09T13:00:00Z'))).toBe(false);
    expect(isDeliveryLate({ ...morning, status: 'cancelled' }, new Date('2026-10-09T13:00:00Z'))).toBe(false);
  });
});
