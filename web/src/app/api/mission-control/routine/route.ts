import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { apiError } from '@/lib/api-errors';

/**
 * Mission Control's Routine members (client 2026-10-08): status, plan, day and window, next
 * pickup and skips in a row, with the customer and their area. Admin only.
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
        'id, status, cadence, pickup_day, pickup_window, next_pickup_date, paused_until, consecutive_skips, created_at, cancelled_at, customer:customers!customer_id(full_name, email, phone), address:addresses(city, zip)'
      )
      .order('created_at', { ascending: false })
      .limit(500);
    return NextResponse.json({ members: data || [] });
  } catch (err: unknown) {
    return apiError('api/mission-control/routine', err, 500);
  }
}
