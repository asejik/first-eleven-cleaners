import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { buildVanReport, loadVanReport, VAN_REPORT_DAYS } from '@/lib/van-report';
import { apiError } from '@/lib/api-errors';

/**
 * The van report, VAN-01 (client 2026-10-23), in the Growth tab. GET ?days=7|30|90|0
 * (0: since the start; default 30). Admin only.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const asked = Number(new URL(request.url).searchParams.get('days') ?? 30);
    const days = (VAN_REPORT_DAYS as readonly number[]).includes(asked) ? asked : 30;
    if (!isSupabaseConfigured()) {
      return NextResponse.json(buildVanReport({ events: [], vanOrders: [], customers: [], customerOrders: [] }, days, null));
    }
    return NextResponse.json(await loadVanReport(createAdminClient(), days));
  } catch (err: unknown) {
    return apiError('api/mission-control/van-report', err, 500);
  }
}
