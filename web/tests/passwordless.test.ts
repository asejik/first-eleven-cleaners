import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client 2026-10-08 (Part 2, Routine): "sign-in is a text code or magic link,
// no password, no extra fields". Customers only; a text code only goes to a
// phone the owner verified (a guest booking can type any phone).
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const authCalls: Array<{ fn: string; args: unknown }> = [];

/** A tiny in-memory Supabase: the filters used by lib/passwordless.ts really filter. */
function table(name: string) {
  type Filter = (r: Row) => boolean;
  const filters: Filter[] = [];
  let op: 'select' | 'insert' | 'update' = 'select';
  let values: Row = {};
  let order: { col: string; asc: boolean } | null = null;
  let limit = Infinity;
  const rows = () => (db[name] ||= []);
  const matching = () => {
    let out = rows().filter((r) => filters.every((f) => f(r)));
    if (order) {
      const { col, asc } = order;
      out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    return out.slice(0, limit);
  };
  const run = () => {
    if (op === 'insert') {
      rows().push({ id: `row-${rows().length + 1}`, attempts: 0, used_at: null, created_at: new Date().toISOString(), ...values });
      return { data: null, error: null };
    }
    if (op === 'update') {
      const hit = matching();
      hit.forEach((r) => Object.assign(r, values));
      return { data: hit, error: null };
    }
    return { data: matching(), error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (v: Row) => ((op = 'insert'), (values = v), b),
    update: (v: Row) => ((op = 'update'), (values = v), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    ilike: (c: string, v: string) => (filters.push((r) => String(r[c]).toLowerCase() === v.replace(/\\(.)/g, '$1').toLowerCase()), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    not: (c: string, _op: string, v: unknown) => (filters.push((r) => (r[c] ?? null) !== v), b),
    gt: (c: string, v: string) => (filters.push((r) => String(r[c]) > v), b),
    order: (col: string, o?: { ascending?: boolean }) => ((order = { col, asc: o?.ascending !== false }), b),
    limit: (n: number) => ((limit = n), b),
    maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return b;
}

const admin = {
  from: table,
  auth: {
    admin: {
      createUser: async (args: unknown) => (authCalls.push({ fn: 'createUser', args }), { data: {}, error: null }),
      generateLink: async (args: unknown) => (authCalls.push({ fn: 'generateLink', args }), { data: { properties: { hashed_token: 'tok_hash_1' } }, error: null }),
    },
  },
};
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
const verifyOtp = vi.fn(async () => ({ error: null }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { verifyOtp } }) }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));
const reportError = vi.fn();
vi.mock('@/lib/error-reporting', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
let signedIn: Row | null = null;
vi.mock('@/lib/supabase/auth-helpers', () => ({ verifyApiAuth: async () => ({ customer: signedIn }) }));

import { sendSignInLink, sendSignInCode, checkCode, confirmPhoneVerification, sendPhoneVerificationCode, SENT_LINK_MESSAGE, BAD_CODE_MESSAGE } from '@/lib/passwordless';
import { POST as startPOST } from '@/app/api/auth/passwordless/start/route';
import { POST as verifyPOST } from '@/app/api/auth/passwordless/verify/route';

let outbound: Array<{ url: string; body: string }> = [];
const originalEnv = { ...process.env };
const lastCode = () => {
  const sms = outbound.filter((o) => o.url.includes('api.twilio.com')).pop();
  return new URLSearchParams(sms?.body).get('Body')?.match(/\b(\d{6})\b/)?.[1] ?? '';
};
const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
  handler(new Request('http://localhost/api/x', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.customers = [
    { id: 'c1', email: 'dana@example.com', full_name: 'Dana Lee', role: 'customer', auth_id: null, phone: '+12145550100', phone_verified_at: null },
    { id: 'c2', email: 'admin@firstelevencleaners.com', full_name: 'Ops', role: 'admin', auth_id: 'a2', phone: '+12145550199', phone_verified_at: '2026-10-01T00:00:00Z' },
  ];
  authCalls.length = 0;
  outbound = [];
  verifyOtp.mockClear();
  reportError.mockClear();
  signedIn = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
  process.env.TWILIO_ACCOUNT_SID = 'AC123';
  process.env.TWILIO_AUTH_TOKEN = 'tok123';
  process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG123';
  process.env.RESEND_API_KEY = 're_test';
  vi.stubGlobal('fetch', async (url: string, init: { body?: string }) => {
    outbound.push({ url: String(url), body: String(init.body || '') });
    return new Response(JSON.stringify({ id: 'x', sid: 'SM1' }), { status: 200 });
  });
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe('Email link', () => {
  it('emails a guest a sign-in link, creating their account silently', async () => {
    await sendSignInLink(admin as never, 'Dana@Example.com');
    expect(authCalls[0]).toEqual({ fn: 'createUser', args: expect.objectContaining({ email: 'dana@example.com', email_confirm: true }) });
    expect(authCalls[1]).toEqual({ fn: 'generateLink', args: { type: 'magiclink', email: 'dana@example.com' } });
    const email = outbound.find((o) => o.url.includes('api.resend.com'));
    expect(email?.body).toContain('/auth/confirm?token_hash=tok_hash_1&amp;type=magiclink');
  });

  it('sends nothing for staff or unknown emails, and says the same thing', async () => {
    await sendSignInLink(admin as never, 'admin@firstelevencleaners.com');
    await sendSignInLink(admin as never, 'nobody@example.com');
    await sendSignInLink(admin as never, 'd%@example.com');
    expect(outbound).toEqual([]);
    const res = await post(startPOST, { identifier: 'nobody@example.com' });
    expect(await res.json()).toMatchObject({ channel: 'email', message: SENT_LINK_MESSAGE });
  });
});

describe('Text code', () => {
  it('never texts an unverified phone, or a staff phone', async () => {
    await sendSignInCode(admin as never, '(214) 555-0100');
    await sendSignInCode(admin as never, '(214) 555-0199');
    expect(outbound).toEqual([]);
  });

  it('a verified customer signs in with the texted code', async () => {
    db.customers[0].phone_verified_at = '2026-10-08T00:00:00Z';
    const start = await post(startPOST, { identifier: '214-555-0100' });
    expect(await start.json()).toMatchObject({ channel: 'sms', phone: '+12145550100' });
    const code = lastCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(db.sign_in_codes[0].code_hash).not.toContain(code);

    const res = await post(verifyPOST, { phone: '+12145550100', code });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, redirect: '/dashboard' });
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'tok_hash_1' });
    // Used once
    expect((await post(verifyPOST, { phone: '+12145550100', code })).status).toBe(400);
  });

  it('a wrong code fails, and five wrong tries end the code', async () => {
    db.customers[0].phone_verified_at = '2026-10-08T00:00:00Z';
    await sendSignInCode(admin as never, '+12145550100');
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    const res = await post(verifyPOST, { phone: '+12145550100', code: wrong });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: BAD_CODE_MESSAGE });
    for (let i = 0; i < 4; i++) await checkCode(admin as never, { phone: '+12145550100', code: wrong, purpose: 'sign_in' });
    expect(await checkCode(admin as never, { phone: '+12145550100', code, purpose: 'sign_in' })).toBeNull();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('an expired code fails', async () => {
    db.customers[0].phone_verified_at = '2026-10-08T00:00:00Z';
    await sendSignInCode(admin as never, '+12145550100');
    db.sign_in_codes[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await checkCode(admin as never, { phone: '+12145550100', code: lastCode(), purpose: 'sign_in' })).toBeNull();
  });
});

describe('Verifying the phone (signed in)', () => {
  it('a texted code marks the phone verified', async () => {
    expect(await sendPhoneVerificationCode(admin as never, 'c1')).toEqual({ ok: true });
    expect(await confirmPhoneVerification(admin as never, 'c1', lastCode())).toBe(true);
    expect(db.customers[0].phone_verified_at).toEqual(expect.any(String));
  });

  it('staff accounts cannot turn on text sign-in', async () => {
    expect(await sendPhoneVerificationCode(admin as never, 'c2')).toMatchObject({ ok: false });
  });

  it('the database clears the verification whenever the phone changes', () => {
    const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '20261008_routine_and_passwordless.sql'), 'utf8');
    expect(sql).toContain('BEFORE UPDATE OF phone ON customers');
    expect(sql).toMatch(/NEW\.phone IS DISTINCT FROM OLD\.phone AND NEW\.phone_verified_at IS NOT DISTINCT FROM OLD\.phone_verified_at/);
    const schema = readFileSync(join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
    expect(schema).toContain('customers_clear_phone_verification');
    // Customers can't mark their own phone verified
    expect(schema).not.toMatch(/GRANT UPDATE \([^)]*phone_verified_at/);
  });
});
