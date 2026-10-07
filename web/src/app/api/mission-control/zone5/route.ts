import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { getCoverage } from '@/lib/coverage-settings';
import { isExtendedReachRunDate } from '@/lib/coverage';
import { upcomingRunSummaries, dispatchRunIfReady } from '@/lib/extended-reach';
import { recordAdminAction } from '@/lib/audit-log';
import { getClientIp } from '@/lib/rate-limiter';
import { apiError } from '@/lib/api-errors';

/**
 * Mission Control's Zone 5 panel (client 2026-10-07, 8D): each upcoming run's bookings
 * against its threshold, the "dispatch anyway" override, and the waitlist. Admin only.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const coverage = await getCoverage();
    if (!isSupabaseConfigured()) return NextResponse.json({ runs: [], waitlist: [] });
    const supabase = createAdminClient();
    const [runs, { data: waitlist }] = await Promise.all([
      upcomingRunSummaries(supabase, coverage),
      supabase
        .from('waitlist')
        .select('id, full_name, email, phone, city, zip, miles, source, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    return NextResponse.json({ runs, waitlist: waitlist || [] });
  } catch (err: unknown) {
    return apiError('api/mission-control/zone5', err, 500);
  }
}

const DispatchSchema = z.object({
  run_date: z.iso.date(),
  band: z.enum(['A', 'B']),
});

/** "Dispatch anyway": runs the route below its threshold and tells its customers the date. */
export async function POST(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const { run_date, band } = DispatchSchema.parse(await request.json());
    const coverage = await getCoverage();
    if (!isExtendedReachRunDate(run_date, coverage.extendedReach)) {
      return NextResponse.json({ error: `${run_date} is not a Zone 5 route day.` }, { status: 400 });
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Dispatch needs the database connected.' }, { status: 503 });
    }
    const supabase = createAdminClient();
    const outcome = await dispatchRunIfReady(supabase, {
      runDate: run_date,
      band,
      reach: coverage.extendedReach,
      force: true,
      actor: auth.customer?.email || 'admin',
    });
    await recordAdminAction(supabase, {
      actor: auth.customer,
      action: 'zone5.dispatch_anyway',
      targetType: 'route_cycle',
      targetId: `${run_date}/${band}`,
      details: { booked: outcome.booked, threshold: outcome.threshold, notified: outcome.notified },
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true, ...outcome });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Choose a run date and band.' }, { status: 400 });
    }
    return apiError('api/mission-control/zone5', err, 500);
  }
}
