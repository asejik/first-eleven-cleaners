import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
const { state } = vi.hoisted(() => ({
  state: {
    existingCustomer: null as Row | null,
    authUpdates: [] as { id: string; attrs: Row }[],
    authCreates: [] as Row[],
  },
}));

vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: { id: 'admin-1', email: 'admin@firstelevencleaners.com', role: 'admin' }, user: {} }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      insert: () => b,
      update: () => b,
      maybeSingle: async () => ({ data: state.existingCustomer, error: null }),
      single: async () => ({ data: { id: 'cust-1', created_at: '2026-10-05T00:00:00Z' }, error: null }),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return {
      from: () => b,
      auth: {
        admin: {
          updateUserById: async (id: string, attrs: Row) => {
            state.authUpdates.push({ id, attrs });
            return { data: { user: { id } }, error: null };
          },
          createUser: async (attrs: Row) => {
            state.authCreates.push(attrs);
            return { data: { user: { id: 'new-auth-id' } }, error: null };
          },
          listUsers: async () => ({ data: { users: [] }, error: null }),
        },
      },
    };
  },
}));

import { POST } from '@/app/api/staff/route';

function addStaff() {
  return POST(
    new Request('http://localhost/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Driver Person',
        email: 'driver.person@example.com',
        phone: '2145550100',
        role: 'driver',
        password: 'AdminChosen#2026',
      }),
    })
  );
}

describe('Adding staff never overwrites or returns passwords (SEC-22)', () => {
  beforeEach(() => {
    state.existingCustomer = null;
    state.authUpdates = [];
    state.authCreates = [];
  });

  it('elevates an existing account without touching its password', async () => {
    state.existingCustomer = { id: 'cust-1', auth_id: 'auth-existing', email: 'driver.person@example.com', full_name: 'Driver Person', role: 'customer' };
    const res = await addStaff();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(state.authUpdates).toHaveLength(1);
    expect(state.authUpdates[0].attrs).not.toHaveProperty('password');
    expect(JSON.stringify(body)).not.toContain('AdminChosen#2026');
    expect(body.message).toContain('existing password is unchanged');
  });

  it('creates a new account with the admin-chosen password but never echoes it', async () => {
    const res = await addStaff();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(state.authCreates[0]).toMatchObject({ password: 'AdminChosen#2026' });
    expect(body).not.toHaveProperty('temporary_password');
    expect(JSON.stringify(body)).not.toContain('AdminChosen#2026');
  });
});
