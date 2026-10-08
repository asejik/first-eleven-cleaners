import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { placeScheduledHolds, markExpiredHolds, runPaymentNeededLadder, runQuoteLadder } from '@/lib/daily-jobs';
import { rollExtendedReachRuns } from '@/lib/extended-reach';
import { createRoutinePickups } from '@/lib/routine-pickups';
import { getCoverage } from '@/lib/coverage-settings';
import { apiError } from '@/lib/api-errors';

/**
 * Daily job (client 2026-10-06): a safety net for Zone 5 runs tomorrow that the evening route
 * check (/api/cron/route-check, client 2026-10-08) didn't decide (first, so no hold is placed
 * for a pickup that moved), Routine pickups made 2 days ahead with a "skip this one?" text, card holds 2 days before pickup (Zone 5: once its run is confirmed), expired holds, the Payment
 * Needed reminder ladder, and the quote ladder (reminder, staff call, returned unaltered). Vercel Cron calls it at 14:00 UTC (9 AM Dallas
 * in summer, 8 AM in winter; vercel.json) with "Authorization: Bearer <CRON_SECRET>".
 * Fails closed: without CRON_SECRET set, nobody can run it.
 */
export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (secret.length < 16) return false;
  const given = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const supabase = createAdminClient();
    const now = new Date();
    const coverage = await getCoverage();
    const routes = await rollExtendedReachRuns(supabase, coverage, now, { daysAhead: 1 });
    // Routine pickups 2 days out (client 2026-10-08), before the holds so they get theirs now
    const routine = await createRoutinePickups(supabase, coverage, now);
    const holds = await placeScheduledHolds(supabase, now);
    const expiredHolds = await markExpiredHolds(supabase, now);
    const ladder = await runPaymentNeededLadder(supabase, now);
    const quotes = await runQuoteLadder(supabase, now);
    return NextResponse.json({ ok: true, routes, routine, holds, expiredHolds, ladder, quotes });
  } catch (err: unknown) {
    return apiError('api/cron/daily', err, 500);
  }
}
