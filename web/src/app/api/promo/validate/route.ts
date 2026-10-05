import { NextResponse } from 'next/server';
import { PROMO_CODE_LAUNCH, PROMO_DISCOUNT_PERCENT } from '@/lib/constants';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-errors';
import { hasUsedPromo, promoUsedMessage } from '@/lib/promo';

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = await checkRateLimitAsync(`promo:${clientIp}`, 10, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { valid: false, message: 'Too many promo validation attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const { code, email } = await request.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ valid: false, message: 'Please provide a valid code.' }, { status: 400 });
    }

    const cleanCode = code.trim().toUpperCase();

    // 1. Check live Supabase promo_codes table
    const isSupabaseConfigured =
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

    if (isSupabaseConfigured) {
      try {
        const supabase = createAdminClient();
        const { data: promo, error } = await supabase
          .from('promo_codes')
          .select('id, code, discount_type, discount_value, max_uses, current_uses, valid_from, valid_until, is_active')
          .eq('code', cleanCode)
          .eq('is_active', true)
          .maybeSingle();

        if (!error && promo) {
          const now = new Date();

          // Validate date window
          if (promo.valid_from && new Date(promo.valid_from) > now) {
            return NextResponse.json({ valid: false, message: 'This promo code is not yet active.' });
          }
          if (promo.valid_until && new Date(promo.valid_until) < now) {
            return NextResponse.json({ valid: false, message: 'This promo code has expired.' });
          }

          // Validate max usage
          if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
            return NextResponse.json({ valid: false, message: 'This promo code has reached its maximum usage limit.' });
          }

          // One use per customer (SEC-15), checked here so the customer hears it before the
          // card step instead of at Confirm (P05 AR-02). Signed in: their account. Signed out:
          // a returning guest's record for this email (a registered email must log in to book).
          const customerId = await resolveCustomerId(supabase, typeof email === 'string' ? email : null);
          if (customerId && (await hasUsedPromo(supabase, customerId, cleanCode))) {
            return NextResponse.json({ valid: false, already_used: true, message: promoUsedMessage(cleanCode) });
          }

          const discountValue = Number(promo.discount_value);
          const discountMsg =
            promo.discount_type === 'percentage'
              ? `${discountValue}% discount applied!`
              : `$${discountValue.toFixed(2)} discount applied!`;

          return NextResponse.json({
            valid: true,
            code: promo.code,
            discount_type: promo.discount_type,
            discount_value: discountValue,
            message: discountMsg,
          });
        }
      } catch (dbErr) {
        console.warn('Promo database lookup error, falling back to static constants:', dbErr);
      }
    }

    // 2. Fallback to hardcoded launch promo constants
    if (cleanCode === PROMO_CODE_LAUNCH) {
      if (isSupabaseConfigured) {
        const supabase = createAdminClient();
        const customerId = await resolveCustomerId(supabase, typeof email === 'string' ? email : null);
        if (customerId && (await hasUsedPromo(supabase, customerId, cleanCode))) {
          return NextResponse.json({ valid: false, already_used: true, message: promoUsedMessage(cleanCode) });
        }
      }
      return NextResponse.json({
        valid: true,
        code: cleanCode,
        discount_type: 'percentage',
        discount_value: PROMO_DISCOUNT_PERCENT,
        message: `${PROMO_DISCOUNT_PERCENT}% first-order discount applied!`,
      });
    }

    return NextResponse.json({
      valid: false,
      message: 'Invalid or expired promo code.',
    });
  } catch (err: unknown) {
    return apiError('api/promo/validate', err, 400);
  }
}

async function resolveCustomerId(
  supabase: ReturnType<typeof createAdminClient>,
  email: string | null
): Promise<string | null> {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (user) {
      const { data } = await supabase.from('customers').select('id').eq('auth_id', user.id).maybeSingle();
      if (data?.id) return data.id;
    }
  } catch {
    // No session: fall through to the guest lookup
  }

  const cleanEmail = email?.trim();
  if (!cleanEmail) return null;
  const { data: guest } = await supabase.from('customers').select('id, auth_id').eq('email', cleanEmail).maybeSingle();
  return guest && !guest.auth_id ? guest.id : null;
}
