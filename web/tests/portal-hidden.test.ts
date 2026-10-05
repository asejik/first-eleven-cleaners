import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// PR-20: the commercial portal runs on sample data, so it is switched off
// (pages and APIs return 404) until it is built on real data.
// ---------------------------------------------------------------------------
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: { id: 'admin-1', full_name: 'Ops Admin', role: 'admin' }, user: {} }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/resend', () => ({ sendEmail: vi.fn(async () => ({ success: true })), buildStatementEmailHtml: () => '' }));

import * as portal from '@/app/api/portal/route';
import * as invoices from '@/app/api/portal/invoices/route';
import * as statement from '@/app/api/portal/email-statement/route';
import PortalLayout from '@/app/portal/layout';

const req = (method: string, body?: unknown) =>
  new Request('http://localhost/api/portal', { method, body: body ? JSON.stringify(body) : undefined });

describe('Commercial portal is switched off (PR-20)', () => {
  it('portal APIs return 404 and never serve sample invoices', async () => {
    const responses = await Promise.all([
      portal.GET(req('GET')),
      portal.PATCH(req('PATCH', {})),
      invoices.GET(req('GET')),
      invoices.POST(req('POST', { action: 'pay_invoice', invoice_id: 'inv_1' })),
      statement.POST(req('POST', { account_id: 'a1' })),
    ]);
    for (const res of responses) expect(res.status).toBe(404);
  });

  it('the portal page itself is a 404', () => {
    expect(() => PortalLayout({ children: null })).toThrow();
  });
});
