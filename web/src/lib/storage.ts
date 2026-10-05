import { createAdminClient } from '@/lib/supabase/admin';

// Must match the buckets that exist in Supabase Storage (SEC-31)
export const ALLOWED_STORAGE_BUCKETS = new Set([
  'garment-photos',
  'claims-photos',
]);

/**
 * Validates binary buffer headers against authentic image magic bytes (SEC-010).
 * Prevents file extension spoofing, polyglots, and embedded script attacks.
 */
export function validateImageMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return true;
  }

  // WEBP: 'RIFF' .... 'WEBP'
  const isRiff = buffer.toString('ascii', 0, 4) === 'RIFF';
  const isWebp = buffer.toString('ascii', 8, 12) === 'WEBP';
  if (isRiff && isWebp) {
    return true;
  }

  // HEIC / HEIF: bytes 4-8 equal 'ftyp'
  const isFtyp = buffer.toString('ascii', 4, 8) === 'ftyp';
  if (isFtyp) {
    const brand = buffer.toString('ascii', 8, 12).toLowerCase();
    if (['heic', 'heix', 'mif1', 'msf1', 'hevc'].includes(brand)) {
      return true;
    }
  }

  return false;
}

/**
 * Uploads a binary buffer to an approved Supabase Storage bucket and returns the public CDN URL.
 */
export async function uploadToStorage(
  buffer: Buffer,
  filePath: string,
  contentType: string,
  bucket: string = 'garment-photos'
): Promise<string | null> {
  try {
    if (!ALLOWED_STORAGE_BUCKETS.has(bucket)) {
      console.error(`[Storage] Rejected upload to unauthorized bucket target: "${bucket}" (SEC-010)`);
      return null;
    }

    if (!validateImageMagicBytes(buffer)) {
      console.error(`[Storage] Rejected upload with invalid image magic bytes (SEC-010)`);
      return null;
    }
    const supabase = createAdminClient();

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error(`Supabase storage upload error [${bucket}/${filePath}]:`, error);
      return null;
    }

    if (!data?.path) return null;

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
    return urlData.publicUrl || null;
  } catch (err) {
    console.error('Failed to upload file to storage:', err);
    return null;
  }
}

/**
 * Checks if a string is a base64 Data URL.
 * If yes, converts it to a buffer, uploads it to Supabase Storage, and returns the public URL.
 * If already a remote URL (http/https), returns it as-is.
 */
export async function resolveAndUploadPhotoUrl(
  photoUrl: string | null | undefined,
  orderId: string,
  photoType: string,
  bucket: string = 'garment-photos'
): Promise<string | null> {
  if (!photoUrl || typeof photoUrl !== 'string') {
    return null;
  }

  const trimmed = photoUrl.trim();
  if (!trimmed) return null;

  // If already an HTTP/HTTPS URL, no upload needed. A signed link (from a screen that
  // displayed it) is stored in its permanent form, since signed links expire (SEC-30).
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return canonicalStorageUrl(trimmed);
  }

  // Handle Base64 Data URL (e.g. data:image/jpeg;base64,...)
  if (trimmed.startsWith('data:image/')) {
    const match = trimmed.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!match) {
      return null; // Unrecognized format: never store raw data URLs (PR-06)
    }

    const mimeType = match[1] || 'image/jpeg';
    const base64Data = match[2];
    if (!base64Data) return null;

    const ext = mimeType.includes('png')
      ? 'png'
      : mimeType.includes('webp')
      ? 'webp'
      : 'jpg';

    const safeOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeType = photoType.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeOrderId}/${Date.now()}_${safeType}_${crypto.randomUUID().slice(0, 6)}.${ext}`;

    const buffer = Buffer.from(base64Data, 'base64');
    const uploadedUrl = await uploadToStorage(buffer, filename, mimeType, bucket);

    // Never fall back to storing the base64 string itself: it bloats the row and the
    // photo is lost from storage anyway. Callers treat null as "photo not saved" (PR-06).
    return uploadedUrl;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Private photo buckets (SEC-30)
// Photos are stored as permanent object URLs (/object/public/<bucket>/<path>) but the
// buckets are private, so every API response swaps them for short-lived signed URLs.
// ---------------------------------------------------------------------------
const STORAGE_OBJECT_RE = /\/storage\/v1\/object\/(?:public|sign)\/([^/?#]+)\/([^?#]+)/;

export const PHOTO_LINK_TTL_SECONDS = 60 * 60; // screens: 1 hour
export const MMS_PHOTO_LINK_TTL_SECONDS = 24 * 60 * 60; // Twilio fetches media after sending

function parseStorageUrl(url: string): { bucket: string; path: string; origin: string } | null {
  const match = url.match(STORAGE_OBJECT_RE);
  if (!match || !ALLOWED_STORAGE_BUCKETS.has(match[1])) return null;
  try {
    return { bucket: match[1], path: decodeURIComponent(match[2]), origin: new URL(url).origin };
  } catch {
    return null;
  }
}

/** Permanent stored form of a storage URL (strips signed-URL tokens). Other URLs unchanged. */
export function canonicalStorageUrl(url: string): string {
  const parsed = parseStorageUrl(url);
  if (!parsed) return url;
  return `${parsed.origin}/storage/v1/object/public/${parsed.bucket}/${parsed.path}`;
}

/** Signs storage URLs in bulk; non-storage URLs map to themselves. */
export async function signStorageUrls(urls: string[], expiresIn = PHOTO_LINK_TTL_SECONDS): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const byBucket = new Map<string, { url: string; path: string }[]>();
  for (const url of new Set(urls)) {
    const parsed = parseStorageUrl(url);
    if (!parsed) {
      result.set(url, url);
      continue;
    }
    const list = byBucket.get(parsed.bucket) || [];
    list.push({ url, path: parsed.path });
    byBucket.set(parsed.bucket, list);
  }
  if (byBucket.size === 0) return result;

  const supabase = createAdminClient();
  for (const [bucket, items] of byBucket) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(items.map((i) => i.path), expiresIn);
    if (error || !data) {
      console.error('[storage] Could not sign photo URLs:', error);
      items.forEach((i) => result.set(i.url, i.url));
      continue;
    }
    items.forEach((item, idx) => result.set(item.url, data[idx]?.signedUrl || item.url));
  }
  return result;
}

/** Signs one storage URL (e.g. an MMS photo). */
export async function signStorageUrl(url: string, expiresIn = PHOTO_LINK_TTL_SECONDS): Promise<string> {
  return (await signStorageUrls([url], expiresIn)).get(url) || url;
}

/**
 * Returns a copy of an API payload with every stored photo URL replaced by a signed URL.
 * Walks plain objects and arrays, so routes can wrap whatever they already return.
 */
export async function withSignedPhotoUrls<T>(payload: T, expiresIn = PHOTO_LINK_TTL_SECONDS): Promise<T> {
  const found: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === 'string') {
      if (STORAGE_OBJECT_RE.test(value)) found.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(collect);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(collect);
    }
  };
  collect(payload);
  if (found.length === 0) return payload;

  const signed = await signStorageUrls(found, expiresIn);
  const replace = (value: unknown): unknown => {
    if (typeof value === 'string') return signed.get(value) ?? value;
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)]));
    }
    return value;
  };
  return replace(payload) as T;
}
