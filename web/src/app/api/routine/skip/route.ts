import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { orderIdFromSkipToken } from '@/lib/routine-pickups';
import { MEMBERSHIP_FIELDS, skipAutoPickup } from '@/lib/routine-store';
import { formatLongDate } from '@/lib/coverage';
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
    .select('id, pickup_date, pickup_window, status, routine_membership_id')
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
    return NextResponse.json({
      pickupDate: found.order.pickup_date,
      pickupLabel: formatLongDate(found.order.pickup_date),
      canSkip: found.order.status === 'booked' && found.membership.status === 'active',
      status: found.order.status,
    });
  } catch (err: unknown) {
    return apiError('api/routine/skip', err, 500);
  }
}

export async function POST(request: Request) {
  try {
    const rate = await checkRateLimitAsync(`routine-skip:${getClientIp(request)}`, 20, 15 * 60 * 1000);
    if (!rate.allowed) return NextResponse.json({ error: 'Too many tries. Please wait a few minutes.' }, { status: 429 });
    const { token } = z.object({ token: z.string().max(200) }).parse(await request.json());
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Not available.' }, { status: 503 });
    const found = await pickupFor(token);
    if (!found) return NextResponse.json({ error: 'This skip link is not valid.' }, { status: 404 });
    if (found.order.status !== 'booked') {
      return NextResponse.json({ error: found.order.status === 'cancelled' ? 'This pickup is already skipped.' : 'This pickup is already under way.' }, { status: 400 });
    }
    const decision = await skipAutoPickup(found.supabase, found.membership as unknown as RoutineMembership & { enrolled_order_id: string | null }, found.order);
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 400 });
    return NextResponse.json({ success: true, autoPaused: Boolean(decision.autoPaused), pickupLabel: formatLongDate(found.order.pickup_date) });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'This skip link is not valid.' }, { status: 400 });
    return apiError('api/routine/skip', err, 500);
  }
}
