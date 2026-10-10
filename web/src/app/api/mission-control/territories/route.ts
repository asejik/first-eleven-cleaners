import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { getCoverageSettings } from '@/lib/coverage-settings';
import { FOUNDING_LIMIT } from '@/lib/founding';
import { recordAdminAction } from '@/lib/audit-log';
import { getClientIp } from '@/lib/rate-limiter';
import { apiError } from '@/lib/api-errors';

/**
 * Territories (client 2026-10-10): named groups of ZIPs, each ZIP in one. The Founding 111
 * counter runs per territory. GET lists them with their ZIPs and founders, plus Zone 1-4 ZIPs
 * in no territory yet; POST creates or renames a territory, or moves a ZIP. Admin only.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

const ZipSchema = z.string().regex(/^\d{5}$/, 'ZIP codes are 5 digits.');
const ActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    id: z.string().trim().regex(/^[A-Za-z0-9-]{1,10}$/, 'Use up to 10 letters or numbers for the territory code.'),
    name: z.string().trim().min(2).max(120),
    zone_id: z.enum(['zone_1', 'zone_2', 'zone_3', 'zone_4', 'zone_5']),
  }),
  z.object({ action: z.literal('rename'), id: z.string().max(10), name: z.string().trim().min(2).max(120) }),
  z.object({ action: z.literal('assign_zip'), zip: ZipSchema, territory_id: z.string().max(10) }),
  z.object({ action: z.literal('unassign_zip'), zip: ZipSchema }),
]);

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    if (!isSupabaseConfigured()) return NextResponse.json({ territories: [], unassigned: [], limit: FOUNDING_LIMIT });
    const supabase = createAdminClient();
    const [{ data: territories }, { data: zips }, { data: founders }, settings] = await Promise.all([
      supabase.from('territories').select('id, name, zone_id').order('id'),
      supabase.from('territory_zips').select('zip, territory_id').limit(5000),
      supabase.from('founding_members').select('territory_id, ended_at').limit(10000),
      getCoverageSettings(),
    ]);
    const assigned = new Set((zips || []).map((z) => z.zip));
    return NextResponse.json({
      limit: FOUNDING_LIMIT,
      territories: (territories || []).map((t) => ({
        ...t,
        zips: (zips || []).filter((z) => z.territory_id === t.id).map((z) => z.zip).sort(),
        founders: (founders || []).filter((f) => f.territory_id === t.id).length,
        activeFounders: (founders || []).filter((f) => f.territory_id === t.id && !f.ended_at).length,
      })),
      // ZIPs on the Zone 1-4 table that aren't in any territory (their members can't be founders)
      unassigned: Object.entries(settings.zipZones)
        .filter(([zip]) => !assigned.has(zip))
        .map(([zip, zone]) => ({ zip, zone }))
        .sort((a, b) => a.zip.localeCompare(b.zip)),
    });
  } catch (err: unknown) {
    return apiError('api/mission-control/territories', err, 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const body = ActionSchema.parse(await request.json());
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Needs the database connected.' }, { status: 503 });
    const supabase = createAdminClient();

    if (body.action === 'create') {
      const { error } = await supabase.from('territories').insert({ id: body.id.toUpperCase(), name: body.name, zone_id: body.zone_id });
      if (error) return NextResponse.json({ error: 'That territory code is already used.' }, { status: 409 });
    } else if (body.action === 'rename') {
      const { data, error } = await supabase.from('territories').update({ name: body.name }).eq('id', body.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) return NextResponse.json({ error: 'Territory not found.' }, { status: 404 });
    } else if (body.action === 'assign_zip') {
      const { data: territory } = await supabase.from('territories').select('id').eq('id', body.territory_id).maybeSingle();
      if (!territory) return NextResponse.json({ error: 'Territory not found.' }, { status: 404 });
      const { error } = await supabase.from('territory_zips').upsert({ zip: body.zip, territory_id: body.territory_id }, { onConflict: 'zip' });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('territory_zips').delete().eq('zip', body.zip);
      if (error) throw error;
    }

    await recordAdminAction(supabase, {
      actor: auth.customer,
      action: `territory.${body.action}`,
      targetType: 'territory',
      targetId: 'id' in body ? body.id : body.zip,
      details: body,
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message || 'Please check the details.' }, { status: 400 });
    return apiError('api/mission-control/territories', err, 500);
  }
}
