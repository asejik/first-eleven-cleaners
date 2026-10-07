import { NextResponse } from 'next/server';
import { getCoverage } from '@/lib/coverage-settings';
import { apiError } from '@/lib/api-errors';

/**
 * The coverage rules as bookings use them right now (client 2026-10-07, request 8): the
 * zones with Mission Control's settings applied, Zone 5 and the Express switch. Public.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const coverage = await getCoverage();
    return NextResponse.json({ coverage }, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch (err: unknown) {
    return apiError('api/coverage', err, 500);
  }
}
