/**
 * Browser-side photo preparation for staff uploads (P03 PR-06).
 *
 * Vercel Functions reject request bodies over 4.5 MB, and full-resolution phone photos are
 * often 3-10 MB. Photos are resized to a 1600 px long side and re-encoded as JPEG before
 * upload, which keeps them around 200-500 KB and plenty sharp for garment and doorstep proof.
 */

/** Keep uploads safely under Vercel's 4.5 MB request-body limit (multipart overhead included). */
export const UPLOAD_SAFE_BYTES = 4 * 1024 * 1024;

/** Photos already this small are sent unchanged. */
const KEEP_ORIGINAL_BYTES = 1024 * 1024;

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

const TOO_LARGE_MESSAGE =
  'This photo is too large to upload. Please retake it, or set the camera to a lower resolution or "Most Compatible" format.';

function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'photo';
  return `${base}.jpg`;
}

async function encode(width: number, height: number, draw: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    draw(ctx);
    return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  draw(ctx);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode photo'))), 'image/jpeg', JPEG_QUALITY)
  );
}

/**
 * Returns a file that is safe to upload: the original when it is already small, otherwise a
 * resized JPEG. Throws a user-readable error when the photo can't be made small enough
 * (e.g. a large HEIC photo in a browser that can't decode HEIC).
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (file.size <= KEEP_ORIGINAL_BYTES) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    // EXIF orientation is applied, so portrait phone photos stay upright
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    if (file.size <= UPLOAD_SAFE_BYTES) return file;
    throw new Error(TOO_LARGE_MESSAGE);
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const source = bitmap;
    const blob = await encode(width, height, (ctx) => ctx.drawImage(source, 0, 0, width, height));

    if (blob.size > UPLOAD_SAFE_BYTES) throw new Error(TOO_LARGE_MESSAGE);
    return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
