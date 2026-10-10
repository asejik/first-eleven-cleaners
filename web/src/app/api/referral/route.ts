import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { creditBalance, getOrCreateReferralCode, referralLink, REFERRAL_AMOUNT } from '@/lib/referrals';
import { apiError } from '@/lib/api-errors';

/**
 * The signed-in customer's referral code and link, their account credit, and how many friends
 * have joined (client 2026-10-10: Give $15 / Get $15). The code is made the first time.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['customer'], request);
    if (auth.errorResponse) return auth.errorResponse;
    if (!isSupabaseConfigured() || !auth.customer) return NextResponse.json({ code: null, link: null, credit: 0, amount: REFERRAL_AMOUNT, rewarded: 0, pending: 0 });
    const supabase = createAdminClient();
    const code = await getOrCreateReferralCode(supabase, auth.customer);
    const [credit, { data: referrals }] = await Promise.all([
      creditBalance(supabase, auth.customer.id),
      supabase.from('referrals').select('status').eq('referrer_customer_id', auth.customer.id).limit(500),
    ]);
    return NextResponse.json({
      code,
      link: referralLink(code),
      credit,
      amount: REFERRAL_AMOUNT,
      rewarded: (referrals || []).filter((r) => r.status === 'rewarded').length,
      pending: (referrals || []).filter((r) => r.status === 'pending').length,
    });
  } catch (err: unknown) {
    return apiError('api/referral', err, 500);
  }
}
