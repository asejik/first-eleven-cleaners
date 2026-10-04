import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { adminCalls } = vi.hoisted(() => ({ adminCalls: [] as string[] }));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 59 }),
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 59 }),
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    adminCalls.push('createAdminClient');
    const b: Record<string, unknown> = {
      select: () => b,
      or: () => b,
      eq: () => b,
      update: () => b,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return { from: () => b };
  },
}));

import { POST } from '@/app/api/twilio/webhook/route';

function inbound(body: string) {
  return POST(
    new Request('https://www.firstelevencleaners.com/api/twilio/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: '+12145550100', To: '+16822000039', Body: body, MessageSid: 'SM1' }).toString(),
    })
  );
}

const originalEnv = { ...process.env };

describe('Twilio webhook fails closed without an auth token in production (SEC-14)', () => {
  beforeEach(() => {
    adminCalls.length = 0;
    delete process.env.TWILIO_AUTH_TOKEN;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('rejects an unsigned STOP message in production and touches no data', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await inbound('STOP');
    expect(res.status).toBe(500);
    expect(adminCalls).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it('rejects a request with no signature when the token is configured', async () => {
    process.env.TWILIO_AUTH_TOKEN = 'live-auth-token';
    const res = await inbound('STOP');
    expect(res.status).toBe(403);
  });
});
