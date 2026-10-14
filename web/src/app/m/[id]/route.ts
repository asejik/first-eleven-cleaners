import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAppBaseUrl, ROUTES } from '@/lib/constants';
import { recordTap } from '@/lib/message-tests-store';
import { reportError } from '@/lib/error-reporting';

/**
 * A tracked link in a tested message (client 2026-10-14: "see sends, taps, and bookings"):
 * counts the tap, then opens the page the message points to. Only ever our own pages; an
 * unknown link opens booking.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fallback = new URL(ROUTES.book, request.url);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !isSupabaseConfigured()) return NextResponse.redirect(fallback);
  try {
    const target = await recordTap(createAdminClient(), id);
    const ours = target && (target.startsWith(getAppBaseUrl()) || target.startsWith('/'));
    return NextResponse.redirect(ours ? new URL(target, request.url) : fallback);
  } catch (err) {
    reportError('m/tap', err, { details: `Tap ${id} not counted` });
    return NextResponse.redirect(fallback);
  }
}
