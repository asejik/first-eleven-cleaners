import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { buildOrderTwoReport, loadOrderTwoReport, REPORT_WEEK_CHOICES } from '@/lib/order-two-report';
import { getMessageTests } from '@/lib/message-tests-store';
import { texasDate } from '@/lib/texas-time';
import { apiError } from '@/lib/api-errors';

/**
 * The Growth panel (client 2026-10-14): the order-two rate of each week's new customers, by
 * week, territory, rep code and message-test version. GET ?weeks=4|8|12 (default 8). Admin only.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const asked = Number(new URL(request.url).searchParams.get('weeks'));
    const weeks = (REPORT_WEEK_CHOICES as readonly number[]).includes(asked) ? asked : 8;
    if (!isSupabaseConfigured()) {
      return NextResponse.json(buildOrderTwoReport({ orders: [], repCodes: new Map(), territories: new Map(), sends: [], tests: {} }, weeks, texasDate()));
    }
    return NextResponse.json(await loadOrderTwoReport(createAdminClient(), weeks, await getMessageTests()));
  } catch (err: unknown) {
    return apiError('api/mission-control/order-two-rate', err, 500);
  }
}
