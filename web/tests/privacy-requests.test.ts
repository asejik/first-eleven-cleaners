import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

// ---------------------------------------------------------------------------
// PR-25: privacy requests are validated, the alert email can't carry injected
// HTML, and there are tools (SQL helpers + runbook) to fulfil them.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const { sendEmail, writes } = vi.hoisted(() => ({
  sendEmail: vi.fn<(args: { to: string; subject: string; html: string }) => Promise<{ success: boolean }>>(async () => ({ success: true })),
  writes: [] as { table: string; values: Row }[],
}));

function builder(table: string) {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    maybeSingle: async () => ({ data: null, error: null }),
    upsert: async (v: Row) => {
      writes.push({ table, values: v });
      return { error: null };
    },
    insert: async (v: Row) => {
      writes.push({ table, values: v });
      return { error: null };
    },
  };
  return b;
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }));
vi.mock('@/lib/supabase/auth-helpers', () => ({
  getAuthenticatedCustomer: async () => ({
    user: { id: 'auth-1' },
    customer: { id: 'cust-1', email: 'jane@example.com', full_name: 'Jane Doe', phone: '+12145550100' },
  }),
}));
vi.mock('@/lib/resend', () => ({ sendEmail }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 4 }),
  getClientIp: () => '127.0.0.1',
}));

import { POST } from '@/app/api/customer/data-deletion/route';

function req(body: Row) {
  return new Request('http://localhost/api/customer/data-deletion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  sendEmail.mockClear();
  writes.length = 0;
});

describe('Privacy requests (PR-25)', () => {
  it('escapes customer notes in the privacy alert email', async () => {
    const res = await POST(req({ request_type: 'export', notes: '<a href="https://evil.example">Click to verify</a>' }));
    expect(res.status).toBe(200);
    const html = sendEmail.mock.calls[0][0].html;
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain('&lt;a href=');
  });

  it('tells the privacy officer how to fulfil the request', async () => {
    await POST(req({ request_type: 'deletion' }));
    const html = sendEmail.mock.calls[0][0].html;
    expect(html).toContain("anonymize_customer('cust-1', 'tdpsa_");
    expect(html).toContain('privacy-requests.md');
    await POST(req({ request_type: 'export' }));
    expect(sendEmail.mock.calls[1][0].html).toContain("export_customer_data('cust-1')");
  });

  it('rejects an unknown request type and over-long notes', async () => {
    expect((await POST(req({ request_type: '<img src=x>' }))).status).toBe(400);
    expect((await POST(req({ request_type: 'export', notes: 'x'.repeat(1001) }))).status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it('ships the export and anonymize helpers, server-only, with a runbook', () => {
    const sql = readFileSync('supabase/migrations/20261005_privacy_tools.sql', 'utf8');
    expect(sql).toContain('FUNCTION public.export_customer_data(p_customer_id UUID)');
    expect(sql).toContain('FUNCTION public.anonymize_customer(p_customer_id UUID, p_request_id TEXT DEFAULT NULL)');
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.anonymize_customer\(UUID, TEXT\) FROM PUBLIC, anon, authenticated/);
    expect(existsSync('supabase/runbooks/privacy-requests.md')).toBe(true);
    const schema = readFileSync('supabase/schema.sql', 'utf8');
    expect(schema).toContain('FUNCTION public.anonymize_customer(');
  });
});
