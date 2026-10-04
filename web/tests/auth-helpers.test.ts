import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Cookies seen by the server-side Supabase client (src/lib/supabase/server.ts)
let requestCookies: { name: string; value: string }[] = [];
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => requestCookies,
    set: () => {},
  }),
}));

// Service-role client used for the customer lookup
const customerLookup = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        or: () => ({ maybeSingle: customerLookup }),
      }),
    }),
  }),
}));

import { getAuthenticatedCustomer } from '@/lib/supabase/auth-helpers';

const PROJECT_REF = 'exampleref';

function sessionCookie(accessToken: string, email: string) {
  const session = {
    access_token: accessToken,
    refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: { id: '00000000-0000-0000-0000-000000000001', email, aud: 'authenticated' },
  };
  return {
    name: `sb-${PROJECT_REF}-auth-token`,
    value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
  };
}

describe('getAuthenticatedCustomer cookie verification (SEC-01)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    customerLookup.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects a forged session cookie that Supabase Auth does not verify', async () => {
    requestCookies = [sessionCookie('forged.unsigned.token', 'admin@firstelevencleaners.com')];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 403, error_code: 'bad_jwt', msg: 'invalid JWT' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const result = await getAuthenticatedCustomer();

    expect(result.user).toBeNull();
    expect(result.customer).toBeNull();
    expect(customerLookup).not.toHaveBeenCalled();
  });

  it('resolves the customer when Supabase Auth verifies the cookie session', async () => {
    const verifiedUser = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'customer@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    };
    const customer = { id: 'cust-1', auth_id: verifiedUser.id, email: verifiedUser.email, role: 'customer' };
    requestCookies = [sessionCookie('valid.signed.token', verifiedUser.email)];
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(verifiedUser), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    customerLookup.mockResolvedValue({ data: customer, error: null });

    const result = await getAuthenticatedCustomer();

    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/v1/user');
    expect(result.user?.id).toBe(verifiedUser.id);
    expect(result.customer).toEqual(customer);
  });
});
