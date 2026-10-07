import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { getCoverageSettings, saveCoverageSettings, CoverageSettingsSchema } from '@/lib/coverage-settings';
import { buildCoverage, DEFAULT_COVERAGE_SETTINGS } from '@/lib/coverage';
import { recordAdminAction } from '@/lib/audit-log';
import { getClientIp } from '@/lib/rate-limiter';
import { apiError } from '@/lib/api-errors';
import type { Json } from '@/types/database';

/**
 * Mission Control coverage settings (client 2026-10-07, request 8): zone minimums, route
 * days and distance bands, Zone 5 fees, minimum, Routine discount, thresholds and cadence,
 * and the 24-Hour Express switch. Admin only; every save is in the audit log.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const settings = await getCoverageSettings();
    return NextResponse.json({ settings, defaults: DEFAULT_COVERAGE_SETTINGS, coverage: buildCoverage(settings) });
  } catch (err: unknown) {
    return apiError('api/mission-control/coverage', err, 500);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const settings = CoverageSettingsSchema.parse(await request.json());
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Settings can only be saved with the database connected.' }, { status: 503 });
    }
    const before = await getCoverageSettings();
    const supabase = createAdminClient();
    await saveCoverageSettings(settings, auth.customer?.email || 'admin');
    await recordAdminAction(supabase, {
      actor: auth.customer,
      action: 'coverage.update',
      targetType: 'settings',
      targetId: 'coverage',
      details: { before: before as unknown as Json, after: settings as unknown as Json },
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true, settings, coverage: buildCoverage(settings) });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Please check the settings.' }, { status: 400 });
    }
    return apiError('api/mission-control/coverage', err, 500);
  }
}
