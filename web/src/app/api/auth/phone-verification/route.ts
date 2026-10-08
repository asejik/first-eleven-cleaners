import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { checkRateLimitAsync } from '@/lib/rate-limiter';
import { sendPhoneVerificationCode, confirmPhoneVerification, BAD_CODE_MESSAGE } from '@/lib/passwordless';
import { apiError } from '@/lib/api-errors';

/**
 * Turns on text-code sign-in (client 2026-10-08): the signed-in customer proves the phone on
 * their account with a texted code. GET: is it verified. POST {action:'send'} texts a code;
 * POST {action:'confirm', code} checks it. Customers only.
 */
export const dynamic = 'force-dynamic';

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send') }),
  z.object({ action: z.literal('confirm'), code: z.string().trim() }),
]);

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['customer'], request);
    if (auth.errorResponse) return auth.errorResponse;
    if (!isSupabaseConfigured() || !auth.customer) return NextResponse.json({ phone: null, verified: false });
    const { data } = await createAdminClient().from('customers').select('phone, phone_verified_at').eq('id', auth.customer.id).maybeSingle();
    return NextResponse.json({ phone: data?.phone || null, verified: Boolean(data?.phone_verified_at) });
  } catch (err: unknown) {
    return apiError('api/auth/phone-verification', err, 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyApiAuth(['customer'], request);
    if (auth.errorResponse) return auth.errorResponse;
    if (!isSupabaseConfigured() || !auth.customer) {
      return NextResponse.json({ error: 'Phone verification needs the database connected.' }, { status: 503 });
    }
    const body = BodySchema.parse(await request.json());
    const rate = await checkRateLimitAsync(`phone-verify:${body.action}:${auth.customer.id}`, body.action === 'send' ? 3 : 10, 15 * 60 * 1000);
    if (!rate.allowed) return NextResponse.json({ error: 'Too many tries. Please wait a few minutes.' }, { status: 429 });

    const admin = createAdminClient();
    if (body.action === 'send') {
      const sent = await sendPhoneVerificationCode(admin, auth.customer.id);
      return sent.ok ? NextResponse.json({ success: true }) : NextResponse.json({ error: sent.error }, { status: 400 });
    }
    const ok = await confirmPhoneVerification(admin, auth.customer.id, body.code);
    return ok ? NextResponse.json({ success: true, verified: true }) : NextResponse.json({ error: BAD_CODE_MESSAGE }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: BAD_CODE_MESSAGE }, { status: 400 });
    return apiError('api/auth/phone-verification', err, 500);
  }
}
