import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { withSignedPhotoUrls } from '@/lib/storage';
import { apiError } from '@/lib/api-errors';
import { checkTickAllowed, MATCH_READY_ITEMS } from '@/lib/match-ready';
import { addCheckPhoto, loadMatchReady, setCheckItem } from '@/lib/match-ready-store';

/**
 * The Match-Ready Check for one order (client 2026-10-14), for intake staff and admins.
 * GET: the 11 items, what's ticked, the check photos and whether the order may go out.
 * POST: tick or untick an item 1-10 (items 2 and 3 say whether something was found), or add
 * a check photo (pocket item, stain, return), or save the plant's ticket number. Moving the
 * order is a Mission Control move.
 */
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

const BodySchema = z.union([
  z.object({ item: z.number().int().min(1).max(10), ticked: z.boolean(), found: z.boolean().optional() }),
  z.object({ photo: z.object({ type: z.enum(['pocket_item', 'stain', 'return']), url: z.string().url().max(2000) }) }),
  z.object({ plant_ticket_number: z.string().trim().max(40).nullable() }),
]);

async function view(id: string) {
  const state = await loadMatchReady(createAdminClient(), id);
  if (!state) return null;
  const checkPhotos = state.photos.filter((p) => ['pocket_item', 'stain', 'return'].includes(p.photo_type));
  return withSignedPhotoUrls({ items: MATCH_READY_ITEMS, order: state.order, checks: state.checks, photos: checkPhotos, summary: state.summary });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiAuth(['admin', 'intake_staff'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ items: MATCH_READY_ITEMS, order: null, checks: [], photos: [], summary: null });
    }
    const result = await view(id);
    if (!result) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    return NextResponse.json(result);
  } catch (err: unknown) {
    return apiError('api/orders/match-ready', err, 500);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiAuth(['admin', 'intake_staff'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Please check the details.' }, { status: 400 });
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Needs the database connected.' }, { status: 503 });

    const supabase = createAdminClient();
    const state = await loadMatchReady(supabase, id);
    if (!state) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    const by = auth.customer?.full_name || auth.customer?.email || 'Intake';
    const body = parsed.data;

    if ('plant_ticket_number' in body) {
      await supabase.from('orders').update({ plant_ticket_number: body.plant_ticket_number || null }).eq('id', id);
    } else if ('photo' in body) {
      if (['out_for_delivery', 'delivered', 'cancelled'].includes(state.order.status)) {
        return NextResponse.json({ error: 'This order has already left the check.' }, { status: 409 });
      }
      const saved = await addCheckPhoto(supabase, id, { type: body.photo.type, photoUrl: body.photo.url, by });
      if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
    } else {
      if (body.ticked) {
        const allowed = checkTickAllowed(body.item, state.order.status, { found: body.found, photos: state.photos });
        if (!allowed.ok) return NextResponse.json({ error: allowed.error }, { status: 409 });
      } else if (['out_for_delivery', 'delivered', 'cancelled'].includes(state.order.status)) {
        return NextResponse.json({ error: 'This order has already left the check.' }, { status: 409 });
      }
      await setCheckItem(supabase, id, { item: body.item, ticked: body.ticked, found: body.found, by });
    }
    return NextResponse.json(await view(id));
  } catch (err: unknown) {
    return apiError('api/orders/match-ready', err, 500);
  }
}
