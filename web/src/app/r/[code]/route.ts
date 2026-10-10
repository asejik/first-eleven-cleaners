import { NextResponse, type NextRequest } from 'next/server';
import { ROUTES } from '@/lib/constants';

/**
 * A friend's referral link (client 2026-10-10: "Everyone gets a personal code and link"):
 * opens booking with their code applied ($15 off a first order). The code is checked when
 * the customer reaches Review and again at booking.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  return NextResponse.redirect(new URL(clean ? `${ROUTES.book}?ref=${clean}` : ROUTES.book, request.url));
}
