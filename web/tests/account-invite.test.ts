import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fakeRpc } from './helpers/fake-create-booking';

// ---------------------------------------------------------------------------
// P05 AR-14: CLAUDE.md 5A asks for a non-intrusive account invitation in the
// booking confirmation email. Guest confirmations now carry a "Create your
// account" link to /signup with the email filled in; signed-in customers don't
// get one.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const { state, dispatchStageNotification } = vi.hoisted(() => ({
  state: { authUser: null as Row | null },
  dispatchStageNotification: vi.fn(async () => ({ success: true })),
}));

function builder(table: string) {
  let op = 'select';
  let values: Row = {};
  let isCount = false;
  const result = () => {
    if (isCount) return { count: 0, error: null };
    if (op === 'insert') return { data: { id: `${table}-new-id`, ...values }, error: null };
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {
    select: (_c?: string, opts?: { head?: boolean }) => {
      if (opts?.head) isCount = true;
      return b;
    },
    insert: (v: Row) => {
      op = 'insert';
      values = v;
      return b;
    },
    update: () => {
      op = 'update';
      return b;
    },
    eq: () => b,
    neq: () => b,
    ilike: () => b,
    maybeSingle: async () => result(),
    single: async () => result(),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t), rpc: fakeRpc(builder) }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.authUser } }) } }),
}));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification } }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));

import { POST } from '@/app/api/bookings/route';
import { buildStageNotificationEmailHtml } from '@/lib/resend';

function nextMonday(): string {
  const todayTx = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  const d = new Date(`${todayTx}T12:00:00`);
  d.setDate(d.getDate() + 2);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  return d.toISOString().split('T')[0];
}
const booking = () =>
  POST(
    new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { full_name: 'Guest Tester', email: 'guest.tester+1@example.com', phone: '2145550100' },
        address: { street: '100 Test St', city: 'Dallas', state: 'TX', zip: '75201' },
        services: { type: 'wash_fold', dry_clean_items: [], estimated_weight_lbs: 15 },
        schedule: { pickup_date: nextMonday(), pickup_window: 'morning', express_tier: 'standard', frequency: 'one_time' },
        consents: { sms_order_updates: false, sms_promotions: false },
      }),
    })
  );
const lastPayload = () => (dispatchStageNotification.mock.calls.at(-1) as unknown as [Row])[0];

const originalEnv = { ...process.env };
beforeEach(() => {
  state.authUser = null;
  dispatchStageNotification.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleref.supabase.co';
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.firstelevencleaners.com';
  delete process.env.SQUARE_ACCESS_TOKEN;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('Guest confirmations invite the customer to create an account (AR-14)', () => {
  it('a guest booking confirmation carries a signup link with the email filled in', async () => {
    const res = await booking();
    expect(res.status).toBe(200);
    expect(lastPayload().signupUrl).toBe('https://www.firstelevencleaners.com/signup?email=guest.tester%2B1%40example.com');
  });

  it('a signed-in customer gets no signup link', async () => {
    state.authUser = { id: 'auth-1', email: 'guest.tester+1@example.com' };
    await booking();
    expect(lastPayload().signupUrl).toBeUndefined();
  });

  it('the email shows the invitation only when there is a link', () => {
    const base = { stageTitle: 'Pickup Confirmed', customerName: 'Pat Doe', orderNumber: 'F11-1', messageBody: 'Booked', trackingUrl: 'https://x/track/1' };
    const withLink = buildStageNotificationEmailHtml({ ...base, signupUrl: 'https://x/signup?email=a%40b.com&x="y' });
    expect(withLink).toContain('Create your account');
    expect(withLink).toContain('href="https://x/signup?email=a%40b.com&amp;x=&quot;y"');
    expect(buildStageNotificationEmailHtml(base)).not.toContain('Create your account');
  });

  it('the signup page fills in the email from the link', () => {
    const page = readFileSync(join(__dirname, '..', 'src/app/signup/page.tsx'), 'utf8');
    expect(page).toContain("searchParams.get('email')");
  });
});
