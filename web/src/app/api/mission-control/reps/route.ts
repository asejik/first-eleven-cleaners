import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { normalizeRepCode, parseRepCode } from '@/lib/reps';
import { recordAdminAction } from '@/lib/audit-log';
import { getClientIp } from '@/lib/rate-limiter';
import { apiError } from '@/lib/api-errors';

/**
 * Field reps (client 2026-10-14): the owner's list of rep codes, TERRITORY-WAVE-REP (e.g.
 * 1D-W1-JM), each a field rep or a driver (referral cards). GET lists them with how many
 * customers carry each code; POST adds a rep, switches one off (or back on), or sets its type. A code is never deleted, so past signups keep it. Admin only.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), code: z.string().max(40), rep_name: z.string().trim().min(2).max(120), kind: z.enum(['field', 'driver']).default('field') }),
  z.object({ action: z.literal('set_active'), code: z.string().max(40), active: z.boolean() }),
  // Field rep or driver (referral cards): paid at different rates (client 2026-10-14)
  z.object({ action: z.literal('set_kind'), code: z.string().max(40), kind: z.enum(['field', 'driver']) }),
]);

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    if (!isSupabaseConfigured()) return NextResponse.json({ reps: [] });
    const supabase = createAdminClient();
    const [{ data: reps }, { data: stamped }] = await Promise.all([
      supabase.from('reps').select('code, territory_id, rep_name, kind, active, created_at, deactivated_at').order('code'),
      supabase.from('customers').select('rep_code').not('rep_code', 'is', null).limit(20000),
    ]);
    const counts = new Map<string, number>();
    for (const row of stamped || []) if (row.rep_code) counts.set(row.rep_code, (counts.get(row.rep_code) || 0) + 1);
    return NextResponse.json({ reps: (reps || []).map((r) => ({ ...r, customers: counts.get(r.code) || 0 })) });
  } catch (err: unknown) {
    return apiError('api/mission-control/reps', err, 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Please check the details.' }, { status: 400 });
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Needs the database connected.' }, { status: 503 });
    const supabase = createAdminClient();
    const body = parsed.data;
    const code = normalizeRepCode(body.code);

    if (body.action === 'add') {
      const parts = parseRepCode(code);
      if (!parts) {
        return NextResponse.json({ error: 'Use the TERRITORY-WAVE-REP format, for example 1D-W1-JM.' }, { status: 400 });
      }
      const { data: territory } = await supabase.from('territories').select('id').eq('id', parts.territory).maybeSingle();
      if (!territory) {
        return NextResponse.json({ error: `${parts.territory} isn't one of your territories. Check the code, or add the territory first.` }, { status: 400 });
      }
      const { error } = await supabase.from('reps').insert({ code, territory_id: parts.territory, rep_name: body.rep_name, kind: body.kind, created_by: auth.customer?.email || 'admin' });
      if (error) {
        return NextResponse.json({ error: error.code === '23505' ? `${code} is already on the list.` : 'The rep was not saved.' }, { status: 409 });
      }
      await recordAdminAction(supabase, {
        actor: auth.customer,
        action: 'rep.add',
        targetType: 'rep',
        targetId: code,
        details: { rep_name: body.rep_name, kind: body.kind },
        ip: getClientIp(request),
      });
      return NextResponse.json({ success: true, code });
    }

    const { data: changed } = await supabase
      .from('reps')
      .update(body.action === 'set_kind' ? { kind: body.kind } : { active: body.active, deactivated_at: body.active ? null : new Date().toISOString() })
      .eq('code', code)
      .select('code');
    if (!changed || changed.length === 0) return NextResponse.json({ error: 'No rep has that code.' }, { status: 404 });
    await recordAdminAction(supabase, {
      actor: auth.customer,
      action: body.action === 'set_kind' ? 'rep.kind' : body.active ? 'rep.activate' : 'rep.deactivate',
      targetType: 'rep',
      targetId: code,
      details: body.action === 'set_kind' ? { kind: body.kind } : {},
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return apiError('api/mission-control/reps', err, 500);
  }
}
