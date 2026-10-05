import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-18: phone numbers are stored in one format (E.164), STOP/START reach every
// matching customer, and unknown SMS consent means no SMS.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
let customers: Row[] = [];
const updates: { filters: Row; values: Row }[] = [];

function builder(table: string) {
  const filters: Row = {};
  let updateValues: Row | null = null;
  const rows = () => (table === 'customers' ? customers.filter((c) => Object.entries(filters).every(([k, v]) => c[k] === v)) : []);
  const b: Record<string, unknown> = {
    select: () => b,
    update: (v: Row) => {
      updateValues = v;
      return b;
    },
    insert: async () => ({ error: null }),
    eq: (k: string, v: unknown) => {
      filters[k] = v;
      return b;
    },
    or: () => b, // the old string filter matches nothing in this fake
    order: () => b,
    limit: () => b,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (r: unknown) => unknown) => {
      if (updateValues) updates.push({ filters: { ...filters }, values: updateValues });
      return Promise.resolve({ data: rows(), error: null }).then(resolve);
    },
  };
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 59 }),
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 59 }),
  getClientIp: () => '127.0.0.1',
}));

import { toE164 } from '@/lib/phone';
import { POST as twilioPOST } from '@/app/api/twilio/webhook/route';
import { TwilioMessageProvider } from '@/lib/messaging';

const originalEnv = { ...process.env };
beforeEach(() => {
  customers = [];
  updates.length = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
  delete process.env.TWILIO_AUTH_TOKEN;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('toE164 (PR-18)', () => {
  it('normalizes US numbers in any common format', () => {
    for (const raw of ['2145550100', '(214) 555-0100', '214.555.0100', '1-214-555-0100', '+1 214 555 0100']) {
      expect(toE164(raw), raw).toBe('+12145550100');
    }
  });
  it('keeps international numbers that already have a country code', () => {
    expect(toE164('+234 903 369 4489')).toBe('+2349033694489');
    expect(toE164('+44 20 7946 0958')).toBe('+442079460958');
  });
  it('rejects things that are not phone numbers', () => {
    for (const raw of ['', '123', '555-0100', 'call me', '+12', '2145550100999999']) expect(toE164(raw), raw).toBeNull();
  });
});

const inbound = (body: string, from = '+12145550100') =>
  twilioPOST(
    new Request('https://www.firstelevencleaners.com/api/twilio/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: from, To: '+16822000039', Body: body, MessageSid: 'SM1' }).toString(),
    })
  );

describe('STOP / START reach every customer with that number (PR-18)', () => {
  it('STOP opts out all records sharing the phone', async () => {
    customers = [
      { id: 'guest', phone: '+12145550100', sms_consent: true },
      { id: 'account', phone: '+12145550100', sms_consent: true },
    ];
    const res = await inbound('STOP');
    expect(res.status).toBe(200);
    const optOut = updates.find((u) => u.values.sms_consent === false);
    expect(optOut?.filters).toMatchObject({ phone: '+12145550100' });
  });

  it('START opts back in by the normalized number', async () => {
    customers = [{ id: 'c1', phone: '+12145550100', sms_consent: false }];
    await inbound('START');
    expect(updates.find((u) => u.values.sms_consent === true)?.filters).toMatchObject({ phone: '+12145550100' });
  });
});

describe('SMS is sent only with known consent, to a valid number (PR-18)', () => {
  const twilioCalls: string[] = [];
  beforeEach(() => {
    twilioCalls.length = 0;
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'secret';
    process.env.TWILIO_PHONE_NUMBER = '+16822000039';
    delete process.env.RESEND_API_KEY;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) => {
        if (String(input).includes('twilio')) twilioCalls.push(String(init?.body));
        return new Response(JSON.stringify({ sid: 'SM1' }), { status: 200 });
      })
    );
  });

  const payload = (overrides: Row = {}) => ({
    orderId: 'o1',
    orderNumber: 'F11-1',
    customerName: 'Pat',
    customerPhone: '(214) 555-0100',
    stage: 'picked_up' as const,
    trackingUrl: 'https://x/track/o1',
    ...overrides,
  });

  it('does not text when consent could not be confirmed', async () => {
    await new TwilioMessageProvider().dispatchStageNotification(payload());
    expect(twilioCalls).toHaveLength(0);
  });

  it('texts the E.164 form of the number when consent is given', async () => {
    await new TwilioMessageProvider().dispatchStageNotification(payload({ smsConsent: true }));
    expect(twilioCalls).toHaveLength(1);
    expect(new URLSearchParams(twilioCalls[0]).get('To')).toBe('+12145550100');
  });

  it('does not text an invalid number', async () => {
    await new TwilioMessageProvider().dispatchStageNotification(payload({ smsConsent: true, customerPhone: '555-0100' }));
    expect(twilioCalls).toHaveLength(0);
  });
});
