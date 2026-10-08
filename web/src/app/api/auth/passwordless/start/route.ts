import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { toE164 } from '@/lib/phone';
import { isEmailIdentifier, sendSignInLink, sendSignInCode, SENT_LINK_MESSAGE, SENT_CODE_MESSAGE } from '@/lib/passwordless';
import { apiError } from '@/lib/api-errors';

/**
 * Passwordless sign-in, step 1 (client 2026-10-08): an email gets a sign-in link, a mobile
 * number gets a 6-digit code (only a number verified for text sign-in). The answer is the
 * same whether or not an account matched. Rate-limited per address and per identifier.
 */
export const dynamic = 'force-dynamic';

const StartSchema = z.object({ identifier: z.string().trim().min(5).max(255) });

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function POST(request: Request) {
  try {
    const { identifier } = StartSchema.parse(await request.json());
    const isEmail = isEmailIdentifier(identifier);
    const phone = isEmail ? null : toE164(identifier);
    if (!isEmail && !phone) {
      return NextResponse.json({ error: 'Enter your email address or a US mobile number.' }, { status: 400 });
    }
    const key = isEmail ? identifier.trim().toLowerCase() : phone!;
    const [byIp, byIdentifier] = await Promise.all([
      checkRateLimitAsync(`passwordless:ip:${getClientIp(request)}`, 10, 15 * 60 * 1000),
      checkRateLimitAsync(`passwordless:id:${key}`, 3, 15 * 60 * 1000),
    ]);
    if (!byIp.allowed || !byIdentifier.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a few minutes and try again.' }, { status: 429 });
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Sign-in without a password needs the database connected.' }, { status: 503 });
    }

    const admin = createAdminClient();
    if (isEmail) {
      await sendSignInLink(admin, identifier);
      return NextResponse.json({ success: true, channel: 'email', message: SENT_LINK_MESSAGE });
    }
    await sendSignInCode(admin, phone!);
    return NextResponse.json({ success: true, channel: 'sms', phone, message: SENT_CODE_MESSAGE });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Enter your email address or a US mobile number.' }, { status: 400 });
    }
    return apiError('api/auth/passwordless/start', err, 500);
  }
}
