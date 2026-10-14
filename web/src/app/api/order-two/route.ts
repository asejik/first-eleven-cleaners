import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { orderTwoDiscountFor } from '@/lib/order-two';
import { apiError } from '@/lib/api-errors';

/**
 * Would a one-time pickup on this date be the signed-in customer's order two (client
 * 2026-10-14)? The booking screen shows the $10 off before checkout; the booking server works
 * it out again on its own, for guests too.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['customer'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const pickupDate = new URL(request.url).searchParams.get('pickup_date') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) || !isSupabaseConfigured() || !auth.customer) return NextResponse.json({ discount: 0 });
    const discount = await orderTwoDiscountFor(createAdminClient(), auth.customer.id, { pickupDate, frequency: 'one_time' });
    return NextResponse.json({ discount });
  } catch (err: unknown) {
    return apiError('api/order-two', err, 500);
  }
}
