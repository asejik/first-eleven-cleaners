import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { orderIdFromSkipToken } from '@/lib/routine-pickups';
import { MEMBERSHIP_FIELDS, skipAutoPickup } from '@/lib/routine-store';
import { formatLongDate } from '@/lib/coverage';
import { assessLateCancel, lateCancelWarning, LATE_CANCEL_ORDER_FIELDS } from '@/lib/late-cancel';
import type { RoutineMembership } from '@/lib/routine';
import { apiError } from '@/lib/api-errors';

/**
 * One-tap skip from the Routine reminder (client 2026-10-07: "One tap to skip; skip never
 * cancels"). The link carries a signed token for that one pickup, so no sign-in is needed.
 * GET: what the link would skip. POST: skip it. The page asks before skipping, so a link
 * preview can never skip by itself.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

async function pickupFor(token: string) {
  const orderId = orderIdFromSkipToken(token);
  if (!orderId) return null;
  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from('orders')
    .select(`${LATE_CANCEL_ORDER_FIELDS}, status, hold_payment_id, hold_status`)
    .eq('id', orderId)
    .maybeSingle();
  if (!order?.routine_membership_id) return null;
  const { data: membership } = await supabase.from('routine_memberships').select(MEMBERSHIP_FIELDS).eq('id', order.routine_membership_id).maybeSingle();
  return membership ? { supabase, order, membership } : null;
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token') || '';
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Not available.' }, { status: 503 });
    const found = await pickupFor(token);
    if (!found) return NextResponse.json({ error: 'This skip link is not valid.' }, { status: 404 });
    const canSkip = found.order.status === 'booked' && found.membership.status === 'active';
    // Under 2 hours before the window: the page shows the fee before the button (2026-10-08)
    const lateFee = canSkip ? await assessLateCancel(found.supabase, found.order) : ({ late: false } as const);
    return NextResponse.json({
      pickupDate: found.order.pickup_date,
      pickupLabel: formatLongDate(found.order.pickup_date),
      canSkip,
      status: found.order.status,
      lateFee: lateFee.late ? { fee: lateFee.fee, waived: lateFee.waived, message: lateCancelWarning(lateFee, 'Skipping') } : null,
    });
  } catch (err: unknown) {
    return apiError('api/routine/skip', err, 500);
  }
}

export async function POST(request: Request) {
  try {
    const rate = await checkRateLimitAsync(`routine-skip:${getClientIp(request)}`, 20, 15 * 60 * 1000);
    if (!rate.allowed) return NextResponse.json({ error: 'Too many tries. Please wait a few minutes.' }, { status: 429 });
    const { token, confirm_late_fee } = z.object({ token: z.string().max(200), confirm_late_fee: z.boolean().optional() }).parse(await request.json());
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Not available.' }, { status: 503 });
    const found = await pickupFor(token);
    if (!found) return NextResponse.json({ error: 'This skip link is not valid.' }, { status: 404 });
    if (found.order.status !== 'booked') {
      return NextResponse.json({ error: found.order.status === 'cancelled' ? 'This pickup is already skipped.' : 'This pickup is already under way.' }, { status: 400 });
    }
    const decision = await skipAutoPickup(found.supabase, found.membership as unknown as RoutineMembership & { enrolled_order_id: string | null }, found.order, new Date(), {
      confirmLateFee: confirm_late_fee === true,
      actor: 'Customer (skip link)',
    });
    if (!decision.ok) {
      return 'code' in decision
        ? NextResponse.json({ error: decision.error, code: decision.code, fee: decision.fee, waived: decision.waived }, { status: 409 })
        : NextResponse.json({ error: decision.error }, { status: 400 });
    }
    const { data: after } = await found.supabase.from('orders').select('late_cancel_status, late_cancel_fee').eq('id', found.order.id).maybeSingle();
    return NextResponse.json({
      success: true,
      autoPaused: Boolean(decision.autoPaused),
      pickupLabel: formatLongDate(found.order.pickup_date),
      lateCancel: after?.late_cancel_status ? { status: after.late_cancel_status, fee: Number(after.late_cancel_fee) || 0 } : { status: 'none' },
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'This skip link is not valid.' }, { status: 400 });
    return apiError('api/routine/skip', err, 500);
  }
}
