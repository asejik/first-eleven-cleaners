import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { buildPayoutReport, getRepRates, lastClosedWeek, payoutReportCsv, payoutWeekOf, saveRepRates, DEFAULT_REP_RATES } from '@/lib/rep-payouts';
import { recordAdminAction } from '@/lib/audit-log';
import { getClientIp } from '@/lib/rate-limiter';
import { apiError } from '@/lib/api-errors';
import type { Json } from '@/types/database';

/**
 * The weekly payout report (client 2026-10-14). GET ?week=YYYY-MM-DD (any day in the week;
 * default: the week just ended) returns it per rep code, or as a CSV file with &format=csv.
 * POST saves the rates. Admin only.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

const RatesSchema = z.object({
  fieldPerOrder: z.number().min(0).max(1000),
  startingXiBonus: z.number().min(0).max(1000),
  driverPerOrder: z.number().min(0).max(1000),
});

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const params = new URL(request.url).searchParams;
    const asked = params.get('week') || '';
    const week = /^\d{4}-\d{2}-\d{2}$/.test(asked) ? payoutWeekOf(`${asked}T18:00:00Z`) : lastClosedWeek();
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ week, weekEnd: week, rates: DEFAULT_REP_RATES, rows: [], total: 0 });
    }
    const report = await buildPayoutReport(createAdminClient(), week);
    if (params.get('format') === 'csv') {
      return new NextResponse(payoutReportCsv(report), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="rep-payouts-${report.week}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return NextResponse.json(report);
  } catch (err: unknown) {
    return apiError('api/mission-control/rep-payouts', err, 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const parsed = RatesSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Rates are dollar amounts from 0 to 1000.' }, { status: 400 });
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Needs the database connected.' }, { status: 503 });
    const supabase = createAdminClient();
    const before = await getRepRates(supabase);
    await saveRepRates(supabase, parsed.data, auth.customer?.email || 'admin');
    await recordAdminAction(supabase, {
      actor: auth.customer,
      action: 'rep.rates',
      targetType: 'settings',
      targetId: 'rep_rates',
      details: { before: before as unknown as Json, after: parsed.data as unknown as Json },
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return apiError('api/mission-control/rep-payouts', err, 500);
  }
}
