import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-17: every call to an outside service has a timeout, and customer
// notifications never hold up (or get cut off from) the staff action.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
let orderFixture: Row | null = null;

function builder(table: string) {
  const result = () => ({ data: table === 'orders' ? (orderFixture ? [orderFixture] : []) : null, error: null });
  const single = () => ({ data: table === 'orders' ? orderFixture : null, error: null });
  const b: Record<string, unknown> = {
    select: () => b,
    insert: () => b,
    update: () => b,
    eq: () => b,
    maybeSingle: async () => single(),
    single: async () => single(),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }));
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: { id: 'admin-1', full_name: 'Ops Admin', role: 'admin' }, user: {} }),
}));
vi.mock('@/lib/storage', () => ({
  withSignedPhotoUrls: async <T,>(v: T) => v,
  signStorageUrl: async (u: string) => u,
  MMS_PHOTO_LINK_TTL_SECONDS: 86400,
}));

const signals: { url: string; signal: AbortSignal | null | undefined }[] = [];
function captureFetch(body: unknown = {}) {
  signals.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      signals.push({ url: String(input), signal: init?.signal });
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    })
  );
}

const originalEnv = { ...process.env };
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Outside services are called with a timeout (PR-17)', () => {
  it('Square', async () => {
    const { getSquareConfig, getPayment } = await import('@/lib/square');
    process.env.SQUARE_ACCESS_TOKEN = 'EAAAtest';
    process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID = 'LOC';
    captureFetch({ payment: { status: 'COMPLETED' } });
    await getPayment(getSquareConfig(), 'PAY_1');
    expect(signals[0].signal).toBeInstanceOf(AbortSignal);
  });

  it('Resend', async () => {
    const { sendEmail } = await import('@/lib/resend');
    process.env.RESEND_API_KEY = 're_test';
    captureFetch({ id: 'email_1' });
    await sendEmail({ to: 'a@example.com', subject: 's', html: '<p>x</p>' });
    expect(signals[0].signal).toBeInstanceOf(AbortSignal);
  });

  it('Upstash rate limiter', async () => {
    const { checkRateLimitAsync } = await import('@/lib/rate-limiter');
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
    captureFetch([{ result: 1 }, { result: 1 }]);
    await checkRateLimitAsync('timeout-test', 5, 1000);
    expect(signals[0].signal).toBeInstanceOf(AbortSignal);
  });

  it('Anthropic', async () => {
    const { ClaudeAIEngineProvider } = await import('@/lib/ai');
    captureFetch({ content: [{ text: 'Hello' }] });
    await new ClaudeAIEngineProvider('sk-ant-test').generateResponse('hi', []);
    expect(signals.find((s) => s.url.includes('anthropic'))?.signal).toBeInstanceOf(AbortSignal);
  });

  it('Twilio', async () => {
    const { TwilioMessageProvider } = await import('@/lib/messaging');
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'secret';
    process.env.TWILIO_PHONE_NUMBER = '+16822000039';
    delete process.env.RESEND_API_KEY;
    captureFetch({ sid: 'SM1' });
    await new TwilioMessageProvider().dispatchStageNotification({
      orderId: 'o1',
      orderNumber: 'F11-1',
      customerName: 'Pat',
      customerPhone: '+12145550100',
      smsConsent: true,
      stage: 'picked_up',
      trackingUrl: 'https://x/track/o1',
    });
    expect(signals.find((s) => s.url.includes('twilio'))?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('Notifications run after the response (PR-17)', () => {
  it('runAfterResponse runs the task outside a request and swallows its errors', async () => {
    const { runAfterResponse } = await import('@/lib/after-response');
    const task = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(() => runAfterResponse(task, 'test')).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('a stuck notification provider does not hold up a Mission Control stage change', async () => {
    vi.resetModules();
    vi.doMock('@/lib/messaging', () => ({
      messagingService: { dispatchStageNotification: () => new Promise(() => {}) }, // never resolves
    }));
    const { POST } = await import('@/app/api/mission-control/route');
    orderFixture = {
      id: '11111111-2222-3333-4444-555555555555',
      status: 'booked',
      payment_status: 'authorized',
      customer: { full_name: 'Pat', phone: '+12145550100' },
    };
    const res = await Promise.race([
      POST(
        new Request('http://localhost/api/mission-control', {
          method: 'POST',
          body: JSON.stringify({ action: 'advance_stage', order_id: orderFixture.id, new_stage: 'picked_up' }),
        })
      ),
      new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 1000)),
    ]);
    expect(res).not.toBe('timeout');
    expect((res as Response).status).toBe(200);
    vi.doUnmock('@/lib/messaging');
  });
});
