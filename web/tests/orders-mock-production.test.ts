import { describe, it, expect, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-31: sample orders are for local development only; production never
// serves them, even if the Supabase settings go missing.
// ---------------------------------------------------------------------------
vi.mock('@/lib/supabase/auth-helpers', () => ({
  getAuthenticatedCustomer: async () => ({ customer: null, user: null }),
}));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 9 }),
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/storage', () => ({ withSignedPhotoUrls: async <T,>(v: T) => v }));
vi.mock('@/lib/error-reporting', () => ({ reportError: vi.fn() }));

import { GET as listGET } from '@/app/api/orders/route';
import { GET as detailGET } from '@/app/api/orders/[id]/route';

const ORDER_ID = '11111111-2222-3333-4444-555555555555';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('No sample orders in production (PR-31)', () => {
  it('order list and order detail return 503 instead of sample data', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const list = await listGET(new Request('http://localhost/api/orders'));
    const detail = await detailGET(new Request(`http://localhost/api/orders/${ORDER_ID}`), { params: Promise.resolve({ id: ORDER_ID }) });
    expect(list.status).toBe(503);
    expect(detail.status).toBe(503);
    expect(JSON.stringify(await list.json())).not.toContain('ord_sample');
  });

  it('local development still gets sample orders', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const list = await listGET(new Request('http://localhost/api/orders'));
    expect(list.status).toBe(200);
  });
});
