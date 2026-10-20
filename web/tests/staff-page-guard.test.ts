import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#2): "Keep staff systems behind secure, role-based authentication
// ... confirm that proper server-side authorization protects all sensitive information."
// The proxy checks the role before a staff page loads.
// ---------------------------------------------------------------------------
const state: { user: { id: string } | null; role: string | null } = { user: null, role: null };

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.role ? { role: state.role } : null }) }),
      }),
    }),
  }),
}));

const { updateSession } = await import('@/lib/supabase/middleware');
const { staffPageRoles } = await import('@/lib/staff-routes');

const visit = async (path: string) => {
  const res = await updateSession(new NextRequest(`https://www.firstelevencleaners.com${path}`));
  const location = res.headers.get('location');
  return location ? new URL(location).pathname : 'allowed';
};

describe('Staff pages are checked on the server', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    state.user = null;
    state.role = null;
  });
  afterEach(() => vi.unstubAllEnvs());

  it('roles per page', () => {
    expect(staffPageRoles('/mission-control')).toEqual(['admin']);
    expect(staffPageRoles('/mission-control/intake')).toEqual(['admin', 'intake_staff']);
    expect(staffPageRoles('/staff/driver')).toEqual(['admin', 'driver']);
    expect(staffPageRoles('/admin')).toEqual(['admin']);
    expect(staffPageRoles('/driver')).toEqual(['admin', 'driver']);
    expect(staffPageRoles('/mission-controlx')).toBeNull();
    expect(staffPageRoles('/pricing')).toBeNull();
  });

  it('signed out: every staff page goes to sign in; public pages load', async () => {
    for (const path of ['/mission-control', '/mission-control/intake', '/staff/driver', '/admin', '/driver']) {
      expect(await visit(path)).toBe('/login');
    }
    expect(await visit('/pricing')).toBe('allowed');
  });

  it('a signed-in customer goes home', async () => {
    state.user = { id: 'u1' };
    state.role = 'customer';
    expect(await visit('/mission-control')).toBe('/');
    expect(await visit('/staff/driver')).toBe('/');
    expect(await visit('/dashboard')).toBe('allowed');
  });

  it('each staff role reaches only its own pages', async () => {
    state.user = { id: 'u1' };
    state.role = 'driver';
    expect(await visit('/staff/driver')).toBe('allowed');
    expect(await visit('/mission-control')).toBe('/');
    expect(await visit('/mission-control/intake')).toBe('/');

    state.role = 'intake_staff';
    expect(await visit('/mission-control/intake')).toBe('allowed');
    expect(await visit('/mission-control')).toBe('/');
    expect(await visit('/staff/driver')).toBe('/');

    state.role = 'admin';
    for (const path of ['/mission-control', '/mission-control/intake', '/staff/driver']) {
      expect(await visit(path)).toBe('allowed');
    }
  });

  it('no customer record: treated as not staff', async () => {
    state.user = { id: 'u1' };
    expect(await visit('/mission-control')).toBe('/');
  });
});
