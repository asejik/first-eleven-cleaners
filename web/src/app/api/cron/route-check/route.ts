import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { placeScheduledHolds } from '@/lib/daily-jobs';
import { rollExtendedReachRuns } from '@/lib/extended-reach';
import { getCoverage } from '@/lib/coverage-settings';
import { apiError } from '@/lib/api-errors';

/**
 * Evening route check (client 2026-10-08: "We confirm routes Monday by 6 PM"): decides the
 * Zone 5 runs 2 days away (Monday for a Wednesday run). Runs going out get "route confirmed"
 * and their card holds are placed; short runs move a week and get "route not reached".
 * Vercel Cron calls it daily at 22:00 UTC (5 PM Dallas in summer, 4 PM in winter; on the
 * Hobby plan a job can start up to an hour late, so it always lands by 6 PM; vercel.json)
 * with "Authorization: Bearer <CRON_SECRET>". Days with no run 2 days away do nothing.
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
    const routes = await rollExtendedReachRuns(supabase, await getCoverage(), now, { daysAhead: 2 });
    // Holds for the runs just confirmed (other pickups 2 days away got theirs this morning)
    const holds = await placeScheduledHolds(supabase, now);
    return NextResponse.json({ ok: true, routes, holds });
  } catch (err: unknown) {
    return apiError('api/cron/route-check', err, 500);
  }
}
