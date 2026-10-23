import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// The van wrap (client 2026-10-23): /van, "Text PICKUP to 682-200-0039", and every booking
// from the van tracked as VAN-01, reported in Mission Control from visit to revenue.
// ---------------------------------------------------------------------------
const { inserts, customerRow } = vi.hoisted(() => ({
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  customerRow: { value: null as { id: string } | null },
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 59 }),
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 59 }),
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        order: () => b,
        limit: () => b,
        update: () => b,
        insert: async (row: Record<string, unknown> | Record<string, unknown>[]) => {
          for (const r of Array.isArray(row) ? row : [row]) inserts.push({ table, row: r });
          return { error: null };
        },
        maybeSingle: async () => ({ data: table === 'customers' ? customerRow.value : null, error: null }),
      };
      return b;
    },
  }),
}));

import {
  SOURCE_COOKIE,
  bookingAttribution,
  channelFromVia,
  isPickupKeyword,
  parseSourceCookie,
  phoneVisitorId,
  pickupReply,
  sourceCookieValue,
  sourceFromCookieHeader,
  stampMarketingSource,
} from '@/lib/marketing-source';
import { buildVanReport } from '@/lib/van-report';
import { POST as twilioPOST } from '@/app/api/twilio/webhook/route';
import { POST as visitPOST } from '@/app/api/marketing/visit/route';

const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
const VISITOR = '0b6c2f0e-6a8e-4c1d-9b7a-2f1e3d4c5b6a';
const originalEnv = { ...process.env };

describe('VAN-01 links and cookie', () => {
  it('the QR code and the text link name their channel; anything else is the typed address', () => {
    expect(channelFromVia('qr')).toBe('qr');
    expect(channelFromVia('TEXT')).toBe('text');
    expect(channelFromVia(null)).toBe('typed');
    expect(channelFromVia('facebook')).toBe('typed');
  });

  it('the cookie round-trips and rejects anything that is not ours', () => {
    const value = sourceCookieValue('qr', VISITOR);
    expect(value).toBe(`VAN-01.qr.${VISITOR}`);
    expect(parseSourceCookie(value)).toEqual({ source: 'VAN-01', channel: 'qr', visitorId: VISITOR });
    expect(parseSourceCookie(`VAN-02.qr.${VISITOR}`)).toBeNull();
    expect(parseSourceCookie(`VAN-01.email.${VISITOR}`)).toBeNull();
    expect(parseSourceCookie('VAN-01.qr.not-an-id')).toBeNull();
    expect(sourceFromCookieHeader(`a=1; ${SOURCE_COOKIE}=${encodeURIComponent(value)}; b=2`)?.channel).toBe('qr');
    expect(sourceFromCookieHeader('a=1')).toBeNull();
  });
});

describe('PICKUP text', () => {
  it('is recognised in any capitals, and only on its own', () => {
    for (const body of ['PICKUP', 'pickup', 'Pickup', ' PickUp! ', 'pickup.']) expect(isPickupKeyword(body), body).toBe(true);
    for (const body of ['pick up', 'PICKUP tomorrow please', 'SKIP']) expect(isPickupKeyword(body), body).toBe(false);
  });

  it("the reply is the client's wording with the van page link and the opt-out line", () => {
    const reply = pickupReply('https://www.firstelevencleaners.com');
    expect(reply).toContain('Welcome to First Eleven Cleaners! Thanks for reaching out.');
    expect(reply).toContain('Schedule your first pickup here: https://www.firstelevencleaners.com/van?via=text');
    expect(reply).toContain('Reply STOP to opt out.');
  });

  it('the phone is kept only as a hash', () => {
    const id = phoneVisitorId('+12145550100');
    expect(id).toBe(phoneVisitorId('+12145550100'));
    expect(id).not.toBe(phoneVisitorId('+12145550101'));
    expect(id).not.toContain('2145550100');
  });
});

describe('Twilio webhook answers PICKUP automatically', () => {
  beforeEach(() => {
    inserts.length = 0;
    customerRow.value = null;
    delete process.env.TWILIO_AUTH_TOKEN;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const inbound = (body: string) =>
    twilioPOST(
      new Request('https://www.firstelevencleaners.com/api/twilio/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: '+12145550100', To: '+16822000039', Body: body, MessageSid: 'SM1' }).toString(),
      })
    );

  it('replies with the van link and records the text for VAN-01 without the number', async () => {
    const res = await inbound('pickup');
    const xml = await res.text();
    expect(xml).toContain('/van?via=text');
    expect(xml).toContain('Welcome to First Eleven Cleaners!');
    const event = inserts.find((i) => i.table === 'marketing_events')?.row;
    expect(event).toMatchObject({ source: 'VAN-01', channel: 'text', event: 'text_in', visitor_id: phoneVisitorId('+12145550100') });
    expect(JSON.stringify(inserts)).not.toContain('2145550100');
  });
});

describe('Van page visit endpoint', () => {
  beforeEach(() => {
    inserts.length = 0;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const visit = (body: unknown, cookie?: string) =>
    visitPOST(
      new Request('https://www.firstelevencleaners.com/api/marketing/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      })
    );

  it('a first visit by QR sets the 60-day VAN-01 cookie and records the visit', async () => {
    const res = await visit({ event: 'visit', via: 'qr' });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(new RegExp(`^${SOURCE_COOKIE}=VAN-01\\.qr\\.`));
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie).toContain(`Max-Age=${60 * 24 * 60 * 60}`);
    expect(inserts[0].row).toMatchObject({ source: 'VAN-01', channel: 'qr', event: 'visit' });
  });

  it('a later visit keeps the first cookie (the original channel stays)', async () => {
    const res = await visit({ event: 'book_click', via: null }, `${SOURCE_COOKIE}=VAN-01.qr.${VISITOR}`);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(inserts[0].row).toMatchObject({ event: 'book_click', visitor_id: VISITOR });
  });

  it('rejects anything but a visit or a tap', async () => {
    expect((await visit({ event: 'booking' })).status).toBe(400);
  });
});

function fakeDb(opts: { textedRows?: unknown[]; earlierOrders?: unknown[] }) {
  const updates: { table: string; values: Record<string, unknown>; filters: string[] }[] = [];
  return {
    updates,
    client: {
      from: (table: string) => {
        const filters: string[] = [];
        let pendingUpdate: Record<string, unknown> | null = null;
        const b: Record<string, unknown> = {
          select: () => b,
          eq: (k: string, v: unknown) => (filters.push(`${k}=${v}`), b),
          neq: (k: string, v: unknown) => (filters.push(`${k}!=${v}`), b),
          gte: () => b,
          is: (k: string) => (filters.push(`${k} is null`), b),
          update: (values: Record<string, unknown>) => ((pendingUpdate = values), b),
          limit: async () => ({ data: table === 'marketing_events' ? opts.textedRows ?? [] : opts.earlierOrders ?? [] }),
          then: (resolve: (v: unknown) => void) => {
            if (pendingUpdate) updates.push({ table, values: pendingUpdate, filters });
            resolve({ error: null });
          },
        };
        return b;
      },
    },
  };
}

describe('Bookings are stamped VAN-01', () => {
  it('the van cookie wins', async () => {
    const db = fakeDb({});
    const a = await bookingAttribution(db.client as never, { cookieHeader: `${SOURCE_COOKIE}=VAN-01.qr.${VISITOR}`, phoneE164: '+12145550100' });
    expect(a).toEqual({ source: 'VAN-01', channel: 'qr' });
  });

  it('without the cookie, a PICKUP text from the same phone in the last 60 days counts', async () => {
    expect(await bookingAttribution(fakeDb({ textedRows: [{ id: 'e1' }] }).client as never, { cookieHeader: null, phoneE164: '+12145550100' })).toEqual({ source: 'VAN-01', channel: 'text' });
    expect(await bookingAttribution(fakeDb({ textedRows: [] }).client as never, { cookieHeader: null, phoneE164: '+12145550100' })).toBeNull();
  });

  it("a first order stamps the order and the customer; a returning customer's order only the order", async () => {
    const first = fakeDb({ earlierOrders: [] });
    await stampMarketingSource(first.client as never, { attribution: { source: 'VAN-01', channel: 'qr' }, customerId: 'c1', orderId: 'o1' });
    expect(first.updates.map((u) => u.table)).toEqual(['orders', 'customers']);
    expect(first.updates[1].values).toMatchObject({ marketing_source: 'VAN-01', marketing_channel: 'qr' });
    expect(first.updates[1].filters).toContain('marketing_source is null');

    const returning = fakeDb({ earlierOrders: [{ id: 'o0' }] });
    await stampMarketingSource(returning.client as never, { attribution: { source: 'VAN-01', channel: 'qr' }, customerId: 'c1', orderId: 'o2' });
    expect(returning.updates.map((u) => u.table)).toEqual(['orders']);
  });

  it('the booking route stamps it after the order is made, without changing the booking request', () => {
    const route = src('src/app/api/bookings/route.ts');
    expect(route).toContain("bookingAttribution(supabase, { cookieHeader: request.headers.get('cookie')");
    expect(route).toContain('stampMarketingSource(supabase,');
  });
});

describe('Van report', () => {
  it('counts people once at each step, and revenue less refunds', () => {
    const r = buildVanReport(
      {
        events: [
          { channel: 'qr', event: 'visit', visitor_id: 'v1' },
          { channel: 'qr', event: 'visit', visitor_id: 'v1' },
          { channel: 'qr', event: 'visit', visitor_id: 'v2' },
          { channel: 'text', event: 'visit', visitor_id: 'v3' },
          { channel: 'typed', event: 'visit', visitor_id: 'v4' },
          { channel: 'qr', event: 'book_click', visitor_id: 'v1' },
          { channel: 'qr', event: 'book_click', visitor_id: 'v1' },
          { channel: 'text', event: 'book_click', visitor_id: 'v3' },
          { channel: 'text', event: 'text_in', visitor_id: 'sms:a' },
          { channel: 'text', event: 'text_in', visitor_id: 'sms:a' },
          { channel: 'text', event: 'text_in', visitor_id: 'sms:b' },
        ],
        vanOrders: [
          { customer_id: 'c1', status: 'delivered', marketing_channel: 'qr' },
          { customer_id: 'c1', status: 'booked', marketing_channel: 'qr' },
          { customer_id: 'c2', status: 'cancelled', marketing_channel: 'text' },
          { customer_id: 'c3', status: 'booked', marketing_channel: 'text' },
        ],
        customers: [
          { id: 'c1', marketing_channel: 'qr' },
          { id: 'c2', marketing_channel: 'text' },
          { id: 'c3', marketing_channel: 'text' },
        ],
        customerOrders: [
          { customer_id: 'c1', payment_status: 'charged', total: '80.50', refunded_amount: '0' },
          { customer_id: 'c1', payment_status: 'refunded', total: 40, refunded_amount: 10 },
          { customer_id: 'c3', payment_status: 'authorized', total: 60, refunded_amount: 0 },
          { customer_id: 'other', payment_status: 'charged', total: 999, refunded_amount: 0 },
        ],
      },
      30,
      null
    );
    expect(r).toMatchObject({
      source: 'VAN-01',
      visitors: 4,
      pageViews: 5,
      visitorsByChannel: { qr: 2, text: 1, typed: 1 },
      pickupTexts: 3,
      pickupTexters: 2,
      scheduleTaps: 2,
      bookings: 3,
      cancelledBookings: 1,
      bookingsByChannel: { qr: 2, text: 1, typed: 0 },
      newCustomers: 3,
      newCustomersByChannel: { qr: 1, text: 2, typed: 0 },
      payingCustomers: 1,
      revenue: 110.5,
    });
  });

  it('is in the Growth tab of Mission Control', () => {
    expect(src('src/app/mission-control/page.tsx')).toContain('<VanReportPanel />');
  });
});

describe('The van page', () => {
  const page = src('src/app/van/page.tsx');

  it('shows the logo, the motto, the five services and "Schedule Your Pickup" into the existing booking', () => {
    expect(page).toContain('src="/logo.png"');
    expect(page).toContain('${APP_TAGLINE}');
    for (const name of ['Dry Cleaning', 'Wash & Fold', 'Pressing', 'Alterations', 'Pickup & Delivery']) expect(page).toContain(`name: '${name}'`);
    expect(page).toContain('Schedule Your Pickup');
    expect(src('src/app/van/VanTracking.tsx')).toContain('href={ROUTES.book}');
  });

  it('stays out of search results, so its visits are the van', () => {
    expect(page).toMatch(/robots: \{ index: false/);
  });

  it('the privacy policy says what the van cookie and the PICKUP text keep', () => {
    const privacy = src('src/app/privacy/page.tsx');
    expect(privacy).toContain('If you reach us from our van');
    expect(privacy).toContain('kept for 60 days');
    expect(privacy).toContain('a scrambled form of your number');
  });
});
