import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { getCoverage } from '@/lib/coverage-settings';
import { allowedRoutineDays, ROUTINE_MAX_PAUSE_WEEKS, type RoutineMembership, type RoutineTemplate } from '@/lib/routine';
import { applyRoutineChange, getOpenMembership, zoneForTemplate } from '@/lib/routine-store';
import { apiError } from '@/lib/api-errors';

/**
 * The signed-in customer's Routine membership (client 2026-10-08): GET shows it, POST skips the
 * next pickup, pauses (1 to 8 weeks), resumes, changes plan/day/window, or cancels (no fee).
 */
export const dynamic = 'force-dynamic';

const ChangeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('skip') }),
  z.object({ action: z.literal('pause'), weeks: z.number().int().min(1).max(ROUTINE_MAX_PAUSE_WEEKS) }),
  z.object({ action: z.literal('resume') }),
  z.object({ action: z.literal('cancel'), reason: z.string().max(500).optional() }),
  z.object({
    action: z.literal('update'),
    cadence: z.enum(['weekly', 'biweekly']).optional(),
    pickup_day: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']).optional(),
    pickup_window: z.enum(['morning', 'evening']).optional(),
  }),
]);

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

async function load(customerId: string) {
  const supabase = createAdminClient();
  const membership = await getOpenMembership(supabase, customerId);
  if (!membership) return { supabase, membership: null, address: null };
  const { data: address } = membership.address_id
    ? await supabase.from('addresses').select('street, unit, city, zip').eq('id', membership.address_id).maybeSingle()
    : { data: null };
  return { supabase, membership, address };
}

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['customer'], request);
    if (auth.errorResponse) return auth.errorResponse;
    if (!isSupabaseConfigured() || !auth.customer) return NextResponse.json({ membership: null });
    const { membership, address } = await load(auth.customer.id);
    if (!membership) return NextResponse.json({ membership: null });
    const coverage = await getCoverage();
    const zone = zoneForTemplate(membership.template as Partial<RoutineTemplate>, coverage);
    return NextResponse.json({ membership, address, allowedDays: allowedRoutineDays(zone, coverage), zoneName: zone.name });
  } catch (err: unknown) {
    return apiError('api/routine', err, 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyApiAuth(['customer'], request);
    if (auth.errorResponse) return auth.errorResponse;
    if (!isSupabaseConfigured() || !auth.customer) {
      return NextResponse.json({ error: 'Your Routine can only be changed with the database connected.' }, { status: 503 });
    }
    const change = ChangeSchema.parse(await request.json());
    const { supabase, membership } = await load(auth.customer.id);
    if (!membership) return NextResponse.json({ error: "You're not in the Routine." }, { status: 404 });
    const decision = await applyRoutineChange(supabase, membership as unknown as RoutineMembership, change, await getCoverage());
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 400 });
    return NextResponse.json({ success: true, autoPaused: Boolean(decision.autoPaused), patch: decision.patch });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message || 'Please check the change.' }, { status: 400 });
    return apiError('api/routine', err, 500);
  }
}
