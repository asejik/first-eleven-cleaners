import { describe, it, expect, vi, beforeEach } from 'vitest';

const { calls } = vi.hoisted(() => ({ calls: [] as { bucket: string; paths: string[]; expiresIn: number }[] }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[], expiresIn: number) => {
          calls.push({ bucket, paths, expiresIn });
          return {
            data: paths.map((p) => ({ signedUrl: `https://ref.supabase.co/storage/v1/object/sign/${bucket}/${p}?token=abc` })),
            error: null,
          };
        },
      }),
    },
  }),
}));

import {
  canonicalStorageUrl,
  withSignedPhotoUrls,
  resolveAndUploadPhotoUrl,
  MMS_PHOTO_LINK_TTL_SECONDS,
  signStorageUrl,
} from '@/lib/storage';

const PUBLIC_A = 'https://ref.supabase.co/storage/v1/object/public/garment-photos/order-1/a.jpg';
const PUBLIC_B = 'https://ref.supabase.co/storage/v1/object/public/garment-photos/order-1/b.jpg';
const PUBLIC_CLAIM = 'https://ref.supabase.co/storage/v1/object/public/claims-photos/c1/x.png';

describe('Private photo links (SEC-30)', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('turns a signed link back into its permanent stored form', () => {
    const signed = 'https://ref.supabase.co/storage/v1/object/sign/garment-photos/order-1/a.jpg?token=abc';
    expect(canonicalStorageUrl(signed)).toBe(PUBLIC_A);
    expect(canonicalStorageUrl('https://images.unsplash.com/photo.jpg')).toBe('https://images.unsplash.com/photo.jpg');
  });

  it('stores signed links sent back by a screen in permanent form', async () => {
    const signed = 'https://ref.supabase.co/storage/v1/object/sign/garment-photos/order-1/a.jpg?token=abc';
    expect(await resolveAndUploadPhotoUrl(signed, 'order-1', 'intake')).toBe(PUBLIC_A);
  });

  it('signs every stored photo URL in a nested payload, one request per bucket', async () => {
    const payload = {
      orders: [
        { id: 'o1', photos: [{ photo_url: PUBLIC_A }, { photo_url: PUBLIC_B }] },
        { id: 'o2', photos: [{ photo_url: 'https://images.unsplash.com/demo.jpg' }] },
      ],
      claims: [{ photo_urls: [PUBLIC_CLAIM] }],
      count: 3,
    };
    const out = await withSignedPhotoUrls(payload);

    expect(out.orders[0].photos[0].photo_url).toContain('/object/sign/garment-photos/order-1/a.jpg?token=');
    expect(out.orders[0].photos[1].photo_url).toContain('/object/sign/garment-photos/order-1/b.jpg?token=');
    expect(out.orders[1].photos[0].photo_url).toBe('https://images.unsplash.com/demo.jpg');
    expect(out.claims[0].photo_urls[0]).toContain('/object/sign/claims-photos/');
    expect(out.count).toBe(3);
    expect(calls.map((c) => c.bucket).sort()).toEqual(['claims-photos', 'garment-photos']);
    expect(calls.every((c) => c.expiresIn === 3600)).toBe(true);
    expect(JSON.stringify(out)).not.toContain('/object/public/');
  });

  it('gives text-message photos a 24-hour link', async () => {
    await signStorageUrl(PUBLIC_A, MMS_PHOTO_LINK_TTL_SECONDS);
    expect(calls[0].expiresIn).toBe(24 * 60 * 60);
  });
});
