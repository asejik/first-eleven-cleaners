import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { apiError } from '@/lib/api-errors';
import {
  SOURCE_COOKIE,
  SOURCE_COOKIE_DAYS,
  channelFromVia,
  recordMarketingEvent,
  sourceCookieValue,
  sourceFromCookieHeader,
} from '@/lib/marketing-source';

/**
 * The van page (client 2026-10-23): a visit, or a tap on "Schedule Your Pickup". Public and
 * rate-limited. The first van visit sets a 60-day cookie (an anonymous id, nothing personal)
 * that the booking reads; a later visit keeps the first one, so the original channel stays.
 */
const VisitSchema = z.object({
  event: z.enum(['visit', 'book_click']),
  via: z.string().max(20).optional().nullable(),
});

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function POST(request: Request) {
  try {
    const rate = await checkRateLimitAsync(`van-visit:${getClientIp(request)}`, 60, 10 * 60 * 1000);
    if (!rate.allowed) return NextResponse.json({ ok: false }, { status: 429 });
    const { event, via } = VisitSchema.parse(await request.json());

    const existing = sourceFromCookieHeader(request.headers.get('cookie'));
    const channel = channelFromVia(via);
    const visitorId = existing?.visitorId ?? randomUUID();
    if (isSupabaseConfigured()) await recordMarketingEvent(createAdminClient(), { channel, event, visitorId });

    const response = NextResponse.json({ ok: true });
    if (!existing) {
      response.cookies.set(SOURCE_COOKIE, sourceCookieValue(channel, visitorId), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: SOURCE_COOKIE_DAYS * 24 * 60 * 60,
      });
    }
    return response;
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return NextResponse.json({ ok: false }, { status: 400 });
    return apiError('api/marketing/visit', err, 500);
  }
}
