import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PROGRESS_STAGES, progressIndex } from '@/lib/order-progress';
import { CancelledOrderPanel } from '@/components/orders/CancelledOrderPanel';

// ---------------------------------------------------------------------------
// P05 AR-04: the tracker showed a "Cancelled" step on every order, and a
// cancelled order showed every stage (Delivered included) as completed.
// ---------------------------------------------------------------------------
const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
const PAGES = ['src/app/track/[orderId]/page.tsx', 'src/app/dashboard/orders/[id]/page.tsx'];

describe('Order progress timeline (AR-04)', () => {
  it('has the six real stages and no Cancelled step', () => {
    expect(PROGRESS_STAGES.map((s) => s.key)).toEqual([
      'booked', 'picked_up', 'weighed_itemized', 'in_cleaning', 'out_for_delivery', 'delivered',
    ]);
  });

  it('places an active order on its stage, and a cancelled order on none', () => {
    expect(progressIndex('in_cleaning')).toBe(3);
    expect(progressIndex('cancelled')).toBe(-1);
  });

  it('both order pages draw the six stages and switch to the cancelled panel', () => {
    for (const page of PAGES) {
      const code = src(page);
      expect(code, page).toContain('PROGRESS_STAGES.map');
      expect(code, page).not.toContain('ORDER_STATUSES.map');
      expect(code, page).toContain('<CancelledOrderPanel');
    }
  });

  it('the cancelled panel says so plainly and offers a new booking', () => {
    const html = renderToStaticMarkup(createElement(CancelledOrderPanel, { pickupDate: '2026-10-07' }));
    expect(html).toContain('This pickup was cancelled');
    expect(html).toContain('Your card was not charged');
    expect(html).toContain('/book');
    expect(html).not.toMatch(/Delivered|Estimated Delivery|Delayed/);
  });
});
