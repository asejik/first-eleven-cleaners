import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConciergeContext } from '@/lib/ai/context';

// ---------------------------------------------------------------------------
// P05 AR-19: the web concierge and the SMS concierge each had their own copy of
// the "Eleven's Memory" context loader, and both sent the customer's gate code
// to the AI provider, which never uses it.
// ---------------------------------------------------------------------------
const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

function fakeSupabase(selects: string[]) {
  return {
    from: (table: string) => {
      const b: Record<string, unknown> = {
        select: (cols: string) => {
          selects.push(`${table}: ${cols}`);
          return b;
        },
        eq: () => b,
        order: () => b,
        limit: async () => ({ data: [{ id: 'o1', order_number: 'F11-1' }] }),
        maybeSingle: async () => ({ data: table === 'customer_preferences' ? { starch_level: 'light' } : { street: '1 Main St' } }),
      };
      return b;
    },
  };
}

describe('One concierge context loader (AR-19)', () => {
  it('loads preferences, default address and recent orders, without the gate code', async () => {
    const selects: string[] = [];
    const ctx = await loadConciergeContext(fakeSupabase(selects) as never, {
      id: 'c1',
      full_name: 'Pat Doe',
      phone: '+12145550100',
      email: 'pat@example.com',
    });
    expect(ctx).toMatchObject({ customerId: 'c1', customerName: 'Pat Doe', customerPhone: '+12145550100' });
    expect(ctx.customerPreferences).toMatchObject({ starch_level: 'light' });
    expect(ctx.defaultAddress).toMatchObject({ street: '1 Main St' });
    expect(ctx.recentOrders).toHaveLength(1);
    expect(selects.join(' | ')).not.toContain('gate_code');
  });

  it('both concierge routes use it', () => {
    for (const route of ['src/app/api/concierge/route.ts', 'src/app/api/twilio/webhook/route.ts']) {
      const code = src(route);
      expect(code, route).toContain('loadConciergeContext(');
      expect(code, route).not.toContain('gate_code');
    }
  });
});
