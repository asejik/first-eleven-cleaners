import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Client 2026-10-14: "I'll create rep codes in Mission Control. Format is
// TERRITORY-WAVE-REP like 1D-W1-JM, so a list of active reps I can add to and
// switch off." The code is stamped on the customer, not just the first order,
// and can't be added later; a rep code and a friend's referral code can both be
// used on the same signup.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

function table(name: string) {
  type Filter = (r: Row) => boolean;
  const filters: Filter[] = [];
  let op: 'select' | 'insert' | 'update' = 'select';
  let values: Row = {};
  const rows = () => (db[name] ||= []);
  const matching = () => rows().filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (op === 'insert') {
      if (name === 'reps' && rows().some((r) => r.code === values.code)) return { data: null, error: { code: '23505' } };
      rows().push({ ...values });
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
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    not: (c: string) => (filters.push((r) => r[c] != null), b),
    order: () => b,
    limit: () => b,
    maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: table }) }));
let role = 'admin';
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async (roles: string[]) =>
    roles.includes(role)
      ? { customer: { id: 'admin-1', email: 'owner@example.com', full_name: 'Owner', role } }
      : { errorResponse: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) },
  getAuthenticatedCustomer: async () => ({ user: null, customer: null }),
}));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }), getClientIp: () => '127.0.0.1' }));
vi.mock('@/lib/resend', () => ({ buildWelcomeEmailHtml: () => '<p>hi</p>', sendEmail: async () => ({ success: true, id: 'm1' }) }));

import { normalizeRepCode, parseRepCode } from '@/lib/reps';
import { GET as repCodeGET } from '@/app/api/rep-code/route';
import { GET as repsGET, POST as repsPOST } from '@/app/api/mission-control/reps/route';
import { POST as welcomePOST } from '@/app/api/auth/welcome/route';

const reps = (body: Row) => repsPOST(new Request('http://localhost/api/mission-control/reps', { method: 'POST', body: JSON.stringify(body) }));
const check = async (code: string) => (await repCodeGET(new Request(`http://localhost/api/rep-code?code=${encodeURIComponent(code)}`))).json();

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.territories = [{ id: '1D', name: 'Plano', zone_id: 'zone_1' }];
  role = 'admin';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
});

describe('The code format', () => {
  it('TERRITORY-WAVE-REP, typed any old way', () => {
    expect(normalizeRepCode(' 1d w1 jm ')).toBe('1D-W1-JM');
    expect(normalizeRepCode('1D--W1--JM')).toBe('1D-W1-JM');
    expect(parseRepCode('1D-W1-JM')).toEqual({ territory: '1D', wave: 'W1', rep: 'JM' });
    expect(parseRepCode('5H-W12-ABC')).toEqual({ territory: '5H', wave: 'W12', rep: 'ABC' });
    expect(parseRepCode('1D-1-JM')).toBeNull();
    expect(parseRepCode('JM')).toBeNull();
  });
});

describe('Reps in Mission Control', () => {
  it('adds a rep in one of his territories, and refuses a bad format or territory', async () => {
    expect((await reps({ action: 'add', code: '1d-w1-jm', rep_name: 'Jamie M' })).status).toBe(200);
    expect(db.reps).toEqual([expect.objectContaining({ code: '1D-W1-JM', territory_id: '1D', rep_name: 'Jamie M', created_by: 'owner@example.com' })]);
    expect(db.admin_audit_logs).toEqual([expect.objectContaining({ action: 'rep.add', target_id: '1D-W1-JM' })]);
    expect((await reps({ action: 'add', code: '1D-W1-JM', rep_name: 'Jamie M' })).status).toBe(409);
    expect((await reps({ action: 'add', code: 'JM', rep_name: 'Jamie M' })).status).toBe(400);
    expect(await (await reps({ action: 'add', code: '9Z-W1-JM', rep_name: 'Jamie M' })).json()).toMatchObject({ error: expect.stringContaining("9Z isn't one of your territories") });
  });

  it('switches a rep off (and back on), and counts the customers on each code', async () => {
    db.reps = [{ code: '1D-W1-JM', territory_id: '1D', rep_name: 'Jamie M', active: true }];
    db.customers = [{ id: 'c1', rep_code: '1D-W1-JM' }, { id: 'c2', rep_code: '1D-W1-JM' }, { id: 'c3', rep_code: null }];
    expect((await reps({ action: 'set_active', code: '1D-W1-JM', active: false })).status).toBe(200);
    expect(db.reps[0]).toMatchObject({ active: false, deactivated_at: expect.any(String) });
    const listed = await (await repsGET(new Request('http://localhost/api/mission-control/reps'))).json();
    expect(listed.reps).toEqual([expect.objectContaining({ code: '1D-W1-JM', active: false, customers: 2 })]);
  });

  it('admin only', async () => {
    role = 'intake_staff';
    expect((await reps({ action: 'add', code: '1D-W1-JM', rep_name: 'Jamie M' })).status).toBe(403);
  });
});

describe('Checking a code as it is typed', () => {
  it('yes for an active rep, no otherwise, and never the rep\'s name', async () => {
    db.reps = [
      { code: '1D-W1-JM', territory_id: '1D', rep_name: 'Jamie M', active: true },
      { code: '1D-W1-KO', territory_id: '1D', rep_name: 'Kim O', active: false },
    ];
    expect(await check('1d-w1-jm')).toEqual({ code: '1D-W1-JM', valid: true });
    expect(await check('1D-W1-KO')).toEqual({ code: '1D-W1-KO', valid: false });
    expect(await check('hello')).toMatchObject({ valid: false });
  });
});

describe('The rep code at signup', () => {
  const welcome = (email: string, rep_code: string) =>
    welcomePOST(new Request('http://localhost/api/auth/welcome', { method: 'POST', body: JSON.stringify({ name: 'Nina New', email, rep_code }) }));

  it('stamps a new account (made in the last 15 minutes) that has no code yet', async () => {
    db.reps = [{ code: '1D-W1-JM', territory_id: '1D', rep_name: 'Jamie M', active: true }];
    db.customers = [{ id: 'c1', email: 'nina@example.com', created_at: new Date().toISOString(), rep_code: null }];
    await welcome('nina@example.com', '1D-W1-JM');
    expect(db.customers[0]).toMatchObject({ rep_code: '1D-W1-JM', rep_code_at: expect.any(String) });
  });

  it('never stamps an older account, so a code cannot be added later', async () => {
    db.reps = [{ code: '1D-W1-JM', territory_id: '1D', rep_name: 'Jamie M', active: true }];
    db.customers = [{ id: 'c1', email: 'old@example.com', created_at: '2025-01-01T00:00:00Z', rep_code: null }];
    await welcome('old@example.com', '1D-W1-JM');
    expect(db.customers[0].rep_code).toBeNull();
  });
});
