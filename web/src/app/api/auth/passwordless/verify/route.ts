import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { toE164 } from '@/lib/phone';
import { checkCode, customerForSignIn, magicLinkToken, BAD_CODE_MESSAGE } from '@/lib/passwordless';
import { ROUTES } from '@/lib/constants';
import { apiError } from '@/lib/api-errors';

/**
 * Passwordless sign-in, step 2 (client 2026-10-08): a matching text code signs the customer in.
 * The session is made server-side from a one-time account token and set as cookies on this
 * response. Five wrong tries end the code; requests are rate-limited.
 */
export const dynamic = 'force-dynamic';

const VerifySchema = z.object({ phone: z.string().trim().min(7).max(30), code: z.string().trim().regex(/^\d{6}$/) });

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function POST(request: Request) {
  try {
    const parsed = VerifySchema.safeParse(await request.json());
    const phone = parsed.success ? toE164(parsed.data.phone) : null;
    if (!parsed.success || !phone) return NextResponse.json({ error: BAD_CODE_MESSAGE }, { status: 400 });

    const rate = await checkRateLimitAsync(`passwordless:verify:${getClientIp(request)}`, 15, 15 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many tries. Please wait a few minutes and request a new code.' }, { status: 429 });
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Sign-in without a password needs the database connected.' }, { status: 503 });
    }

    const admin = createAdminClient();
    const customerId = await checkCode(admin, { phone, code: parsed.data.code, purpose: 'sign_in' });
    const customer = customerId ? await customerForSignIn(admin, customerId) : null;
    if (!customer) return NextResponse.json({ error: BAD_CODE_MESSAGE }, { status: 400 });

    const tokenHash = await magicLinkToken(admin, customer);
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
    if (error) throw error;
    return NextResponse.json({ success: true, redirect: ROUTES.dashboard });
  } catch (err: unknown) {
    return apiError('api/auth/passwordless/verify', err, 500);
  }
}
