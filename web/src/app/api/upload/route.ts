import { NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import { uploadToStorage } from '@/lib/storage';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit(`upload:${clientIp}`, 30, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Upload rate limit exceeded. Please wait a minute.' },
        { status: 429 }
      );
    }

    const auth = await verifyApiAuth(['admin', 'driver', 'intake_staff', 'customer'], request);
    if (auth.errorResponse) return auth.errorResponse;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const orderId = (formData.get('order_id') as string | null) || 'general';
    const photoType = (formData.get('photo_type') as string | null) || 'proof';
    const bucket = (formData.get('bucket') as string | null) || 'garment-photos';

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'No valid image file provided.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds maximum allowed limit (10MB).' },
        { status: 400 }
      );
    }

    const mimeType = file.type || 'image/jpeg';
    if (!ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
      return NextResponse.json(
        { error: `Unsupported image format (${mimeType}). Supported: JPEG, PNG, WEBP, HEIC.` },
        { status: 400 }
      );
    }

    const ext = mimeType.includes('png')
      ? 'png'
      : mimeType.includes('webp')
      ? 'webp'
      : 'jpg';

    const safeOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeType = photoType.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeOrderId}/${Date.now()}_${safeType}_${crypto.randomUUID().slice(0, 6)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const publicUrl = await uploadToStorage(buffer, filename, mimeType, bucket);

    if (!publicUrl) {
      return NextResponse.json(
        { error: 'Failed to upload photo to storage. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename,
    });
  } catch (err: unknown) {
    console.error('Photo upload API error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Internal server error during upload.' },
      { status: 500 }
    );
  }
}
