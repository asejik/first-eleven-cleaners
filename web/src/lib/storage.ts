import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Uploads a binary buffer to a Supabase Storage bucket and returns the public CDN URL.
 */
export async function uploadToStorage(
  buffer: Buffer,
  filePath: string,
  contentType: string,
  bucket: string = 'garment-photos'
): Promise<string | null> {
  try {
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

  // If already an HTTP/HTTPS URL, no upload needed
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Handle Base64 Data URL (e.g. data:image/jpeg;base64,...)
  if (trimmed.startsWith('data:image/')) {
    const match = trimmed.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!match) {
      return trimmed; // Unrecognized format, return original
    }

    const mimeType = match[1] || 'image/jpeg';
    const base64Data = match[2];
    if (!base64Data) return trimmed;

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

    return uploadedUrl || trimmed; // Fall back to base64 if storage upload failed
  }

  return trimmed;
}
