import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { apiError } from '@/lib/api-errors';
import { recordAdminAction } from '@/lib/audit-log';
import { getClientIp } from '@/lib/rate-limiter';

/**
 * Mission Control's Routine members (client 2026-10-08): status, plan, day and window, next
 * pickup and skips in a row, with the customer and their area. Admin only.
 * PATCH ticks "bag delivered" (the branded bag, given on the first pickup), audit-logged.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    if (!isSupabaseConfigured()) return NextResponse.json({ members: [] });
    const { data } = await createAdminClient()
      .from('routine_memberships')
      .select(
        'id, status, cadence, pickup_day, pickup_window, next_pickup_date, paused_until, consecutive_skips, created_at, cancelled_at, bag_delivered_at, bag_delivered_by, customer:customers!customer_id(full_name, email, phone), address:addresses(city, zip)'
      )
      .order('created_at', { ascending: false })
      .limit(500);
    return NextResponse.json({ members: data || [] });
  } catch (err: unknown) {
    return apiError('api/mission-control/routine', err, 500);
  }
}

const BagSchema = z.object({ id: z.guid(), bag_delivered: z.boolean() });

/** "Bag delivered" for a member (client 2026-10-08): ticked or cleared in Mission Control. */
export async function PATCH(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const { id, bag_delivered } = BagSchema.parse(await request.json());
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Needs the database connected.' }, { status: 503 });
    const supabase = createAdminClient();
    const by = auth.customer?.email || 'admin';
    const values = bag_delivered ? { bag_delivered_at: new Date().toISOString(), bag_delivered_by: by } : { bag_delivered_at: null, bag_delivered_by: null };
    const { data, error } = await supabase.from('routine_memberships').update({ ...values, updated_at: new Date().toISOString() }).eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
    await recordAdminAction(supabase, {
      actor: auth.customer,
      action: bag_delivered ? 'routine.bag_delivered' : 'routine.bag_cleared',
      targetType: 'routine_membership',
      targetId: id,
      details: { bag_delivered },
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true, ...values });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Choose a member.' }, { status: 400 });
    return apiError('api/mission-control/routine', err, 500);
  }
}
