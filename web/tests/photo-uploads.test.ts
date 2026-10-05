import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-06: phone photos must fit Vercel's 4.5 MB request limit, and a failed
// upload must never end up as a multi-MB base64 string in the database.
// ---------------------------------------------------------------------------
const { uploadResult } = vi.hoisted(() => ({ uploadResult: { error: null as null | { message: string } } }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string) =>
          uploadResult.error ? { data: null, error: uploadResult.error } : { data: { path }, error: null },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://ref.supabase.co/storage/v1/object/public/garment-photos/${path}` } }),
      }),
    },
  }),
}));

import { resolveAndUploadPhotoUrl } from '@/lib/storage';
import { prepareImageForUpload, UPLOAD_SAFE_BYTES } from '@/lib/image-upload';

// Smallest valid JPEG header bytes, enough for the magic-byte check
const JPEG_DATA_URL = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0x01, 0x01, 0]).toString('base64')}`;

beforeEach(() => {
  uploadResult.error = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Server never stores base64 photos (PR-06)', () => {
  it('returns the storage URL when the upload succeeds', async () => {
    const url = await resolveAndUploadPhotoUrl(JPEG_DATA_URL, 'order-1', 'intake');
    expect(url).toMatch(/^https:\/\/ref\.supabase\.co\/storage\/v1\/object\/public\/garment-photos\/order-1\//);
  });

  it('returns null, not the base64 string, when storage rejects the upload', async () => {
    uploadResult.error = { message: 'bucket full' };
    expect(await resolveAndUploadPhotoUrl(JPEG_DATA_URL, 'order-1', 'intake')).toBeNull();
  });

  it('returns null for unrecognised data URLs and other non-URL strings', async () => {
    expect(await resolveAndUploadPhotoUrl('data:image/jpeg;base64', 'order-1', 'intake')).toBeNull();
    expect(await resolveAndUploadPhotoUrl('not-a-url', 'order-1', 'intake')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Browser-side resizing, with the canvas APIs stubbed (Vitest runs in Node)
// ---------------------------------------------------------------------------
function stubCanvas({ decodeFails = false, outputBytes = 300_000 } = {}) {
  const drawn: { width: number; height: number }[] = [];
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      if (decodeFails) throw new Error('cannot decode');
      return { width: 4032, height: 3024, close: () => {} };
    })
  );
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(public width: number, public height: number) {
        drawn.push({ width, height });
      }
      getContext() {
        return { drawImage: () => {} };
      }
      async convertToBlob({ type }: { type: string }) {
        return new Blob([new Uint8Array(outputBytes)], { type });
      }
    }
  );
  return drawn;
}

const bigPhoto = (bytes = 6 * 1024 * 1024, type = 'image/jpeg', name = 'IMG_0001.JPG') =>
  new File([new Uint8Array(bytes)], name, { type });

describe('Photos are resized in the browser before upload (PR-06)', () => {
  it('shrinks a full-size phone photo to a JPEG well under the request limit', async () => {
    const drawn = stubCanvas();
    const out = await prepareImageForUpload(bigPhoto());
    expect(out.type).toBe('image/jpeg');
    expect(out.size).toBeLessThan(UPLOAD_SAFE_BYTES);
    expect(out.name).toMatch(/\.jpg$/);
    expect(Math.max(drawn[0].width, drawn[0].height)).toBe(1600); // long side capped, aspect kept
    expect(drawn[0].width / drawn[0].height).toBeCloseTo(4032 / 3024, 2);
  });

  it('keeps a small photo as it is', async () => {
    stubCanvas();
    const small = bigPhoto(400_000);
    expect(await prepareImageForUpload(small)).toBe(small);
  });

  it('refuses a photo it cannot shrink that is over the limit, with a clear message', async () => {
    stubCanvas({ decodeFails: true });
    await expect(prepareImageForUpload(bigPhoto(6 * 1024 * 1024, 'image/heic', 'IMG.HEIC'))).rejects.toThrow(/too large/i);
  });

  it('sends the original when it cannot be decoded but already fits', async () => {
    stubCanvas({ decodeFails: true });
    const heic = bigPhoto(2 * 1024 * 1024, 'image/heic', 'IMG.HEIC');
    expect(await prepareImageForUpload(heic)).toBe(heic);
  });
});
