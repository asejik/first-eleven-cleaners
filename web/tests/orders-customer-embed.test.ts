import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P05 AR-23: PR-19 added orders.assigned_driver_id REFERENCES customers(id), so
// `orders` has two foreign keys to `customers`. An unhinted embed such as
// `customer:customers(...)` is then ambiguous, and PostgREST refuses it (PGRST201,
// "more than one relationship was found"). Every embed of customers from orders
// must name the key: `customer:customers!customer_id(...)`.
// ---------------------------------------------------------------------------
const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

/** Files whose `customer:customers(...)` embeds are all selected from `orders`. */
const ORDERS_ONLY = [
  'src/app/api/driver/route.ts',
  'src/app/api/intake/route.ts',
  'src/app/api/mission-control/financials/route.ts',
  'src/lib/messaging/index.ts',
];

describe('Order queries name which customer key to embed (AR-23)', () => {
  it.each(ORDERS_ONLY)('%s has no unhinted customers embed', (file) => {
    const code = src(file);
    expect(code).not.toMatch(/customers\(/);
    expect(code).toMatch(/customers!customer_id\(/);
  });

  it('Mission Control: order embeds hinted, the claims embed unchanged', () => {
    const code = src('src/app/api/mission-control/route.ts');
    expect(code.match(/customers!customer_id\(/g)?.length).toBe(2);
    expect(code.match(/customer:customers\(/g)?.length).toBe(1); // from('claims'): one key only
  });

  it('notifications: the order lookup is hinted, the messages feed unchanged', () => {
    const code = src('src/app/api/notifications/route.ts');
    expect(code).toContain("customer:customers!customer_id(id, full_name, phone)'");
    expect(code.match(/customer:customers\(/g)?.length).toBe(1); // from('messages'): one key only
  });
});
