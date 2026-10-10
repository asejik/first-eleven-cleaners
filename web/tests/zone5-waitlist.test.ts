import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Client 2026-10-08: the waitlist texts. Joining the waitlist sends "Thanks,
// you're on the waitlist"; setting the first Zone 5 run date in Mission Control
// tells everyone waiting for Zone 5, once each. Texts only with "text me"
// ticked; everyone else gets the same message by email.
// ---------------------------------------------------------------------------
const reportError = vi.fn();
vi.mock('@/lib/error-reporting', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: { id: 'admin-1', email: 'admin@firstelevencleaners.com', role: 'admin' } }),
}));
vi.mock('@/lib/audit-log', () => ({ recordAdminAction: async () => undefined }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));

type Row = Record<string, unknown>;
const writes: Array<{ table: string; op: string; values: Row }> = [];
let waiting: Row[] = [];
let claimable = true;
let savedSettings: Row | null = null;
const fake = {
  from: (table: string) => {
    let op = 'select';
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (v: Row) => ((op = 'insert'), writes.push({ table, op, values: v }), b),
      update: (v: Row) => ((op = 'update'), writes.push({ table, op, values: v }), b),
      upsert: (v: Row) => ((op = 'upsert'), writes.push({ table, op, values: v }), b),
      eq: () => b,
      is: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: table === 'app_settings' && savedSettings ? { value: savedSettings } : null, error: null }),
      then: (resolve: (r: unknown) => unknown) =>
        Promise.resolve({
          error: null,
          data: op === 'select' ? (table === 'waitlist' ? waiting : []) : op === 'update' ? (claimable ? [{ id: 'w' }] : []) : null,
        }).then(resolve),
    };
    return b;
  },
};
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fake }));

import { DEFAULT_COVERAGE_SETTINGS, buildCoverage } from '@/lib/coverage';
import { sendContactMessage } from '@/lib/messaging/contact';
import { sendWaitlistJoined, announceZone5Open } from '@/lib/zone5-waitlist';

const LIVE = buildCoverage({ ...DEFAULT_COVERAGE_SETTINGS, extendedReach: { ...DEFAULT_COVERAGE_SETTINGS.extendedReach, firstRunDate: '2026-10-21' } });

let calls: Array<{ url: string; body: string }> = [];
const originalEnv = { ...process.env };
beforeEach(() => {
  writes.length = 0;
  waiting = [];
  claimable = true;
  savedSettings = null;
  calls = [];
  reportError.mockClear();
  process.env.TWILIO_ACCOUNT_SID = 'AC123';
  process.env.TWILIO_AUTH_TOKEN = 'tok123';
  process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG123';
  process.env.RESEND_API_KEY = 're_test';
  vi.stubGlobal('fetch', async (url: string, init: { body?: string }) => {
    calls.push({ url: String(url), body: String(init.body || '') });
    return new Response(JSON.stringify({ id: 'x', sid: 'SM1' }), { status: 200 });
  });
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

const smsBody = (i = 0) => new URLSearchParams(calls[i].body).get('Body');

describe('Messages to people with no order yet', () => {
  it('texts only with "text me" ticked, otherwise emails', async () => {
    expect(await sendContactMessage({ phone: '(214) 555-0100', email: 'a@example.com', smsConsent: true, title: 'T', body: 'Hello' })).toEqual({ channel: 'sms', ok: true });
    expect(calls[0].url).toContain('api.twilio.com');
    expect(new URLSearchParams(calls[0].body).get('To')).toBe('+12145550100');
    calls = [];
    expect(await sendContactMessage({ phone: '(214) 555-0100', email: 'a@example.com', smsConsent: false, title: 'T', body: 'Hello' })).toMatchObject({ channel: 'email', ok: true });
    expect(calls[0].url).toContain('api.resend.com');
  });
});

describe('Waitlist: on joining', () => {
  it("sends the client's waitlist text", async () => {
    await sendWaitlistJoined({ full_name: 'Dana Lee', phone: '+12145550100', city: 'Durant', sms_consent: true });
    expect(smsBody()).toBe(
      "First Eleven Cleaners: Thanks, Dana. Durant is just outside our current routes. You're on the waitlist and we'll text you first when we open your area. Reply STOP to opt out."
    );
  });

  it('the waitlist form stores the phone as E.164 with the "text me" choice, then sends it', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    delete process.env.GOOGLE_MAPS_API_KEY;
    const { POST } = await import('@/app/api/waitlist/route');
    const res = await POST(
      new Request('http://localhost/api/waitlist', {
        method: 'POST',
        body: JSON.stringify({ full_name: 'Dana Lee', phone: '(214) 555-0100', city: 'Durant', zip: '74701', sms_consent: true }),
      })
    );
    expect(res.status).toBe(200);
    expect(writes).toContainEqual(
      expect.objectContaining({ table: 'waitlist', op: 'insert', values: expect.objectContaining({ phone: '+12145550100', sms_consent: true }) })
    );
    await vi.waitFor(() => expect(calls.some((c) => c.url.includes('api.twilio.com'))).toBe(true));
  });
});

describe('Waitlist: when the first Zone 5 run date is set', () => {
  const now = new Date('2026-10-08T15:00:00Z');

  it('tells everyone waiting for Zone 5, with the first run and the booking link', async () => {
    waiting = [
      { id: '1', full_name: 'Dana', phone: '+12145550100', email: null, city: 'Sherman', sms_consent: true },
      { id: '2', full_name: 'Lee', phone: null, email: 'lee@example.com', city: 'Waxahachie', sms_consent: false },
    ];
    expect(await announceZone5Open(fake as never, LIVE, now)).toEqual({ told: 2 });
    expect(smsBody(0)).toMatch(
      /^First Eleven Cleaners: Good news, Dana\. Extended Reach now serves Sherman\. First pickup Wed Oct 21, back the following Wednesday\. Book at .+\/book\. Reply STOP to opt out\.$/
    );
    expect(calls[1].url).toContain('api.resend.com');
    expect(writes.filter((w) => w.table === 'waitlist' && w.op === 'update')).toHaveLength(2);
  });

  it('never tells anyone twice', async () => {
    waiting = [{ id: '1', full_name: 'Dana', phone: '+12145550100', city: 'Sherman', sms_consent: true }];
    claimable = false;
    expect(await announceZone5Open(fake as never, LIVE, now)).toEqual({ told: 0 });
    expect(calls).toEqual([]);
  });

  it('does nothing while the first run date is blank', async () => {
    waiting = [{ id: '1', full_name: 'Dana', phone: '+12145550100', city: 'Sherman', sms_consent: true }];
    expect(await announceZone5Open(fake as never, buildCoverage(DEFAULT_COVERAGE_SETTINGS), now)).toEqual({ told: 0 });
    expect(calls).toEqual([]);
  });

  it('Mission Control saving a new first run date sends it; saving it again does not', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    const { PUT } = await import('@/app/api/mission-control/coverage/route');
    const { resetCoverageCache } = await import('@/lib/coverage-settings');
    resetCoverageCache();
    const settings = { ...DEFAULT_COVERAGE_SETTINGS, extendedReach: { ...DEFAULT_COVERAGE_SETTINGS.extendedReach, firstRunDate: '2026-10-21' } };
    waiting = [{ id: '1', full_name: 'Dana', phone: '+12145550100', city: 'Sherman', sms_consent: true }];
    const put = () => PUT(new Request('http://localhost/api/mission-control/coverage', { method: 'PUT', body: JSON.stringify(settings) }));
    expect((await put()).status).toBe(200);
    await vi.waitFor(() => expect(calls.some((c) => c.url.includes('api.twilio.com'))).toBe(true));
    calls = [];
    expect((await put()).status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual([]);
  });
});
