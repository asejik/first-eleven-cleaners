import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { getCoverage, getCoverageSettings, saveCoverageSettings } from '@/lib/coverage-settings';
import { approveTierFlag, computeTierFlags } from '@/lib/tier-down';
import { recordAdminAction } from '@/lib/audit-log';
import { getClientIp } from '@/lib/rate-limiter';
import { apiError } from '@/lib/api-errors';
import type { Json } from '@/types/database';

/**
 * Tier-down flags (client 2026-10-10): GET lists ZIPs ready for their next step down, Zone 5
 * ZIPs ready to promote to Zone 4, and stepped-down ZIPs that have gone quiet (review only),
 * with the thresholds and recent approvals. POST approves a flag, or saves the thresholds.
 * Admin only; audit-logged.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), zip: z.string().regex(/^\d{5}$/), kind: z.enum(['tier_down', 'promote_zone_4']) }),
  z.object({
    action: z.literal('settings'),
    tierDown: z.object({
      flagOrders: z.number().int().min(1).max(1000),
      flagWeeks: z.number().int().min(1).max(52),
      reviewOrders: z.number().int().min(1).max(1000),
      reviewWeeks: z.number().int().min(1).max(52),
    }),
  }),
]);

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const coverage = await getCoverage();
    if (!isSupabaseConfigured()) return NextResponse.json({ flags: [], tierDown: coverage.tierDown, zipMinimums: coverage.zipMinimums, history: [] });
    const supabase = createAdminClient();
    const [flags, { data: history }] = await Promise.all([
      computeTierFlags(supabase, coverage),
      supabase.from('zip_tier_steps').select('zip, action, from_minimum, to_minimum, orders_counted, approved_by, approved_at').order('approved_at', { ascending: false }).limit(50),
    ]);
    return NextResponse.json({ flags, tierDown: coverage.tierDown, zipMinimums: coverage.zipMinimums, history: history || [] });
  } catch (err: unknown) {
    return apiError('api/mission-control/tier-down', err, 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const body = BodySchema.parse(await request.json());
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Needs the database connected.' }, { status: 503 });
    const supabase = createAdminClient();
    const by = auth.customer?.email || 'admin';

    if (body.action === 'settings') {
      const settings = await getCoverageSettings();
      await saveCoverageSettings({ ...settings, tierDown: body.tierDown }, by);
      await recordAdminAction(supabase, {
        actor: auth.customer,
        action: 'tier_down.settings',
        targetType: 'settings',
        targetId: 'coverage',
        details: { before: settings.tierDown as unknown as Json, after: body.tierDown as unknown as Json },
        ip: getClientIp(request),
      });
      return NextResponse.json({ success: true });
    }

    const result = await approveTierFlag(supabase, await getCoverage(), { zip: body.zip, kind: body.kind, by });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    await recordAdminAction(supabase, {
      actor: auth.customer,
      action: body.kind === 'tier_down' ? 'tier_down.approve' : 'tier_down.promote_zone_4',
      targetType: 'zip',
      targetId: body.zip,
      details: { from: result.flag.current, to: result.flag.next, orders: result.flag.orders, told: result.told },
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true, told: result.told });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message || 'Please check the details.' }, { status: 400 });
    return apiError('api/mission-control/tier-down', err, 500);
  }
}
