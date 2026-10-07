import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { placeScheduledHolds, markExpiredHolds, runPaymentNeededLadder, runQuoteLadder } from '@/lib/daily-jobs';
import { apiError } from '@/lib/api-errors';

/**
 * Daily job (client 2026-10-06): card holds 2 days before pickup, expired holds, the Payment
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
    const holds = await placeScheduledHolds(supabase, now);
    const expiredHolds = await markExpiredHolds(supabase, now);
    const ladder = await runPaymentNeededLadder(supabase, now);
    const quotes = await runQuoteLadder(supabase, now);
    return NextResponse.json({ ok: true, holds, expiredHolds, ladder, quotes });
  } catch (err: unknown) {
    return apiError('api/cron/daily', err, 500);
  }
}
