import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Client 2026-10-08: "Reply SKIP to come off the list" cancels the next Zone 5
// pickup (still only booked) and releases its hold; STOP also opts the number
// out of the waitlist texts.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const writes: Array<{ table: string; op: string; values: Row; filters: Row }> = [];
let customers: Row[] = [];
let nextOrder: Row | null = null;
let stillBooked = true;
const fake = {
  from: (table: string) => {
    let op = 'select';
    const filters: Row = {};
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (v: Row) => ((op = 'insert'), writes.push({ table, op, values: v, filters }), b),
      update: (v: Row) => ((op = 'update'), writes.push({ table, op, values: v, filters }), b),
      eq: (c: string, v: unknown) => ((filters[c] = v), b),
      in: (c: string, v: unknown) => ((filters[c] = v), b),
      not: () => b,
      gte: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: table === 'orders' ? nextOrder : null, error: null }),
      then: (resolve: (r: unknown) => unknown) =>
        Promise.resolve({
          error: null,
          data: op === 'select' ? (table === 'customers' ? customers : []) : op === 'update' && table === 'orders' ? (stillBooked ? [{ id: 'o1' }] : []) : [],
        }).then(resolve),
    };
    return b;
  },
};
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fake }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 59 }),
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 59 }),
  getClientIp: () => '127.0.0.1',
}));
const releaseOrderHold = vi.fn(async () => undefined);
vi.mock('@/lib/payment-capture', () => ({ releaseOrderHold: (...a: unknown[]) => releaseOrderHold(...(a as [])) }));
vi.mock('@/lib/ai', () => ({ getAIEngine: () => ({ generateResponse: async () => ({ content: 'Eleven here.' }) }) }));

import { skipNextZone5Pickup, SKIP_NOTHING_REPLY } from '@/lib/zone5-skip';
import { POST } from '@/app/api/twilio/webhook/route';

const now = new Date('2026-10-26T23:30:00Z');
const originalEnv = { ...process.env };
beforeEach(() => {
  writes.length = 0;
  customers = [{ id: 'c1' }];
  nextOrder = { id: 'o1', order_number: 'F11-1', pickup_date: '2026-11-04', hold_payment_id: null, hold_status: 'scheduled' };
  stillBooked = true;
  releaseOrderHold.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
  delete process.env.TWILIO_AUTH_TOKEN;
});
afterEach(() => {
  process.env = { ...originalEnv };
});

function inbound(body: string) {
  return POST(
    new Request('https://www.firstelevencleaners.com/api/twilio/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: '+12145550100', To: '+16822000039', Body: body, MessageSid: 'SM1' }).toString(),
    })
  );
}

describe('SKIP', () => {
  it('cancels the next booked Zone 5 pickup and releases its hold', async () => {
    const reply = await skipNextZone5Pickup(fake as never, '+12145550100', now);
    expect(reply).toMatch(/^First Eleven Cleaners: Done\. Your Extended Reach pickup on Wed Nov 4 is cancelled and nothing is charged\. Book again anytime: .+\/book$/);
    expect(writes).toContainEqual(
      expect.objectContaining({ table: 'orders', op: 'update', values: expect.objectContaining({ status: 'cancelled' }), filters: expect.objectContaining({ status: 'booked' }) })
    );
    expect(writes).toContainEqual(expect.objectContaining({ table: 'order_events', values: expect.objectContaining({ status: 'cancelled' }) }));
    expect(releaseOrderHold).toHaveBeenCalledWith(fake, nextOrder, 'pickup skipped by the customer by text');
  });

  it('says so when there is nothing to skip (or it was already picked up)', async () => {
    nextOrder = null;
    expect(await skipNextZone5Pickup(fake as never, '+12145550100', now)).toBe(SKIP_NOTHING_REPLY);
    nextOrder = { id: 'o1', pickup_date: '2026-11-04' };
    stillBooked = false;
    expect(await skipNextZone5Pickup(fake as never, '+12145550100', now)).toBe(SKIP_NOTHING_REPLY);
    expect(releaseOrderHold).not.toHaveBeenCalled();
  });

  it('a SKIP text is answered by the skip, not by Eleven', async () => {
    const res = await inbound('skip');
    const xml = await res.text();
    expect(xml).toContain('Your Extended Reach pickup on Wed Nov 4 is cancelled');
    expect(xml).not.toContain('Eleven here.');
  });
});

describe('STOP', () => {
  it('opts the number out of the waitlist texts too', async () => {
    await inbound('STOP');
    expect(writes).toContainEqual(expect.objectContaining({ table: 'waitlist', op: 'update', values: { sms_consent: false }, filters: { phone: '+12145550100' } }));
  });
});
