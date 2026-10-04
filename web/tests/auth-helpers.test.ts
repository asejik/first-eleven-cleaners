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
const lookupFilter = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => {
          lookupFilter(column, value);
          return { maybeSingle: customerLookup };
        },
      }),
    }),
  }),
}));

import { getAuthenticatedCustomer, verifyApiAuth } from '@/lib/supabase/auth-helpers';

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
    // SEC-03: the customer is resolved by account ID only, never by email
    expect(lookupFilter).toHaveBeenCalledWith('auth_id', verifiedUser.id);
  });
});

describe('verifyApiAuth role resolution (SEC-02)', () => {
  const originalEnv = { ...process.env };

  // Signs in a verified Supabase user whose customers row has the given role
  function signInAs(email: string, dbRole: string) {
    const verifiedUser = {
      id: '22222222-2222-2222-2222-222222222222',
      email,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: { role: 'admin' }, // user-editable metadata must be ignored
      created_at: new Date().toISOString(),
    };
    requestCookies = [sessionCookie('valid.signed.token', email)];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify(verifiedUser), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    customerLookup.mockResolvedValue({
      data: { id: 'cust-2', auth_id: verifiedUser.id, email, role: dbRole },
      error: null,
    });
  }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    customerLookup.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not grant admin to a hardcoded staff email whose database role is customer', async () => {
    signInAs('admin@firsteleven.com', 'customer');
    const result = await verifyApiAuth(['admin']);
    expect(result.errorResponse?.status).toBe(403);
  });

  it('does not let intake staff bypass admin-only routes', async () => {
    signInAs('intake@firstelevencleaners.com', 'intake_staff');
    const result = await verifyApiAuth(['admin']);
    expect(result.errorResponse?.status).toBe(403);
  });

  it('allows intake staff on intake routes', async () => {
    signInAs('intake@firstelevencleaners.com', 'intake_staff');
    const result = await verifyApiAuth(['intake_staff', 'admin']);
    expect(result.errorResponse).toBeUndefined();
    expect(result.customer?.role).toBe('intake_staff');
  });

  it('allows a driver role from the database on driver routes', async () => {
    signInAs('new.driver@example.com', 'driver');
    const result = await verifyApiAuth(['driver', 'admin']);
    expect(result.errorResponse).toBeUndefined();
    expect(result.customer?.role).toBe('driver');
  });

  it('allows admin on admin routes when the database role is admin', async () => {
    signInAs('owner@example.com', 'admin');
    const result = await verifyApiAuth(['admin']);
    expect(result.errorResponse).toBeUndefined();
  });
});

describe('Forbidden responses reveal nothing about the caller (SEC-19)', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('403 body contains only a generic message', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const email = 'curious.customer@example.com';
    requestCookies = [sessionCookie('valid.signed.token', email)];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'u-9', email, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    customerLookup.mockResolvedValue({ data: { id: 'cust-9', auth_id: 'u-9', email, role: 'customer' }, error: null });

    const result = await verifyApiAuth(['admin']);
    const body = await result.errorResponse!.json();
    expect(result.errorResponse!.status).toBe(403);
    expect(Object.keys(body)).toEqual(['error']);
    expect(JSON.stringify(body)).not.toContain(email);
    expect(JSON.stringify(body)).not.toContain('customer');
  });
});
