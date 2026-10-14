import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { findActiveRep, normalizeRepCode, parseRepCode } from '@/lib/reps';
import { apiError } from '@/lib/api-errors';

/**
 * Is this rep code one we know (client 2026-10-14)? The signup and booking forms check it as
 * it's typed. Only yes or no: never the rep's name. Rate-limited per network.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function GET(request: Request) {
  try {
    const rate = await checkRateLimitAsync(`rep_code:${getClientIp(request)}`, 30, 10 * 60 * 1000);
    if (!rate.allowed) return NextResponse.json({ error: 'Too many tries. Please wait a few minutes.' }, { status: 429 });
    const code = normalizeRepCode(new URL(request.url).searchParams.get('code'));
    if (!parseRepCode(code)) return NextResponse.json({ code, valid: false });
    if (!isSupabaseConfigured()) return NextResponse.json({ code, valid: false });
    const rep = await findActiveRep(createAdminClient(), code);
    return NextResponse.json({ code, valid: Boolean(rep) });
  } catch (err: unknown) {
    return apiError('api/rep-code', err, 500);
  }
}
