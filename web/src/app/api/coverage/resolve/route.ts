import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { getCoverage } from '@/lib/coverage-settings';
import { resolveAddressCoverage } from '@/lib/distance';
import { extendedReachFeeLine } from '@/lib/coverage';
import { bookableRuns } from '@/lib/extended-reach';
import { apiError } from '@/lib/api-errors';

/**
 * Where an address is served (client 2026-10-07, 8A): its zone, and for Zone 5 the band, the
 * delivery fee (full and for Routine members) and the next runs with their bookings against
 * the threshold. Used by the booking screen and the pricing calculator the moment an address
 * resolves. A street is optional (the calculator has only a ZIP code).
 */
export const dynamic = 'force-dynamic';

const ResolveSchema = z.object({
  street: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  zip: z.string().max(10),
});

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function POST(request: Request) {
  try {
    // Each new address can cost a routing lookup: keep it to people typing addresses
    const rate = await checkRateLimitAsync(`coverage_resolve:${getClientIp(request)}`, 40, 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many address checks. Please wait a minute and try again.' }, { status: 429 });
    }
    const address = ResolveSchema.parse(await request.json());
    const coverage = await getCoverage();
    const resolution = await resolveAddressCoverage(address, coverage);

    if (resolution.status !== 'served' || !resolution.band) {
      return NextResponse.json({ resolution, extendedReach: null });
    }

    const line = extendedReachFeeLine(resolution.band, false, coverage.extendedReach);
    const runs = await bookableRuns(isSupabaseConfigured() ? createAdminClient() : null, { band: resolution.band.id, coverage });
    return NextResponse.json({
      resolution,
      extendedReach: {
        band: resolution.band.id,
        fullFee: line?.fullFee ?? 0,
        routineFee: line?.routineFee ?? 0,
        routineDiscountPercent: coverage.extendedReach.routineDiscountPercent,
        minimumOrder: coverage.extendedReach.minimumOrder,
        threshold: resolution.band.dispatchThreshold,
        runs,
      },
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Please enter a 5-digit ZIP code.' }, { status: 400 });
    }
    return apiError('api/coverage/resolve', err, 500);
  }
}
