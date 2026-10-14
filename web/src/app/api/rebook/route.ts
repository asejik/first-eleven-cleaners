import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { getCoverage } from '@/lib/coverage-settings';
import { bookRebook, fallbackText, planRebook, readRebookToken, type RebookFallback } from '@/lib/rebook';
import { apiError } from '@/lib/api-errors';

/**
 * One-tap rebook from the delivered text (client 2026-10-14). The link carries a signed token
 * for that order, so no sign-in is needed. GET: what one tap would book. POST: book it. The
 * page asks first, so a link preview never books by itself. Rate-limited per network.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

const fallback = (reason: RebookFallback) =>
  NextResponse.json({ ok: false, reason, message: fallbackText(reason), next: reason === 'member' ? '/routine' : '/book' });

export async function GET(request: Request) {
  try {
    const rate = await checkRateLimitAsync(`rebook:${getClientIp(request)}`, 30, 15 * 60 * 1000);
    if (!rate.allowed) return NextResponse.json({ error: 'Too many tries. Please wait a few minutes.' }, { status: 429 });
    const token = readRebookToken(new URL(request.url).searchParams.get('token') || '');
    if (!token.ok) return fallback(token.reason);
    if (!isSupabaseConfigured()) return fallback('not_found');
    const planned = await planRebook(createAdminClient(), token.orderId, await getCoverage());
    if (!planned.ok) return fallback(planned.reason);
    const { customerId, orderId, ...shown } = planned.plan;
    void customerId;
    void orderId;
    return NextResponse.json({ ok: true, plan: shown });
  } catch (err: unknown) {
    return apiError('api/rebook', err, 500);
  }
}

export async function POST(request: Request) {
  try {
    const rate = await checkRateLimitAsync(`rebook:${getClientIp(request)}`, 30, 15 * 60 * 1000);
    if (!rate.allowed) return NextResponse.json({ error: 'Too many tries. Please wait a few minutes.' }, { status: 429 });
    const parsed = z.object({ token: z.string().max(200) }).safeParse(await request.json().catch(() => null));
    const token = readRebookToken(parsed.success ? parsed.data.token : '');
    if (!token.ok) return fallback(token.reason);
    if (!isSupabaseConfigured()) return fallback('not_found');
    const booked = await bookRebook(createAdminClient(), token.orderId, await getCoverage());
    if (!booked.ok) return fallback(booked.reason);
    return NextResponse.json({
      ok: true,
      replay: booked.replay,
      order: booked.order,
      dateLabel: booked.plan.dateLabel,
      windowLabel: booked.plan.windowLabel,
      trackUrl: `/track/${booked.order.id}`,
    });
  } catch (err: unknown) {
    return apiError('api/rebook', err, 500);
  }
}
