import { describe, it, expect, vi, beforeEach } from 'vitest';

const { state } = vi.hoisted(() => ({ state: { role: 'customer', uploads: 0 } }));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 29 }),
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async (allowed: string[]) =>
    allowed.includes(state.role)
      ? { customer: { id: 'u1', role: state.role }, user: {} }
      : { customer: null, user: null, errorResponse: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) },
}));
vi.mock('@/lib/storage', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/storage')>();
  return {
    ...actual,
    uploadToStorage: async () => {
      state.uploads++;
      return 'https://example.supabase.co/storage/v1/object/public/garment-photos/x.png';
    },
  };
});

import { POST } from '@/app/api/upload/route';

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);

function upload(bucket = 'garment-photos') {
  const fd = new FormData();
  fd.append('file', new Blob([PNG], { type: 'image/png' }), 'pixel.png');
  fd.append('order_id', 'some-order');
  fd.append('bucket', bucket);
  return POST(new Request('http://localhost/api/upload', { method: 'POST', body: fd }));
}

describe('Photo uploads are staff-only (SEC-24)', () => {
  beforeEach(() => {
    state.uploads = 0;
  });

  it('refuses customers', async () => {
    state.role = 'customer';
    const res = await upload();
    expect(res.status).toBe(403);
    expect(state.uploads).toBe(0);
  });

  it.each(['driver', 'intake_staff', 'admin'])('allows %s', async (role) => {
    state.role = role;
    const res = await upload();
    expect(res.status).toBe(200);
    expect(state.uploads).toBe(1);
  });
});

describe('Upload bucket allow-list matches real buckets (SEC-31)', () => {
  it('lists exactly the buckets that exist in Supabase Storage', async () => {
    const { ALLOWED_STORAGE_BUCKETS } = await vi.importActual<typeof import('@/lib/storage')>('@/lib/storage');
    expect([...ALLOWED_STORAGE_BUCKETS].sort()).toEqual(['claims-photos', 'garment-photos']);
  });

  it('rejects a bucket that does not exist', async () => {
    state.role = 'intake_staff';
    const res = await upload('delivery-proofs');
    expect(res.status).toBe(400);
  });
});
