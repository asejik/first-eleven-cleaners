import type { createAdminClient } from '@/lib/supabase/admin';
import { resolveAndUploadPhotoUrl } from '@/lib/storage';
import { summarizeMatchReady, FOUND_NOTE, NONE_FOUND_NOTE, type MatchReadyCheckRow, type MatchReadyPhotoType, type MatchReadySummary } from '@/lib/match-ready';

/** The Match-Ready Check's database side (client 2026-10-14). Server only. */
type AdminClient = ReturnType<typeof createAdminClient>;

export const MATCH_READY_FIELDS = 'id, order_number, status, plant_ticket_number, match_ready_intake_exempt, match_ready_override_reason, match_ready_override_by, match_ready_override_at';

export interface MatchReadyState {
  order: {
    id: string;
    order_number: string;
    status: string;
    plant_ticket_number: string | null;
    match_ready_intake_exempt: boolean;
    match_ready_override_reason: string | null;
    match_ready_override_by: string | null;
    match_ready_override_at: string | null;
  };
  checks: MatchReadyCheckRow[];
  photos: Array<{ id?: string; photo_type: string; photo_url: string; captured_at?: string | null }>;
  summary: MatchReadySummary;
}

export async function loadMatchReady(supabase: AdminClient, orderId: string): Promise<MatchReadyState | null> {
  const { data: order } = await supabase.from('orders').select(MATCH_READY_FIELDS).eq('id', orderId).maybeSingle();
  if (!order) return null;
  const [{ data: checks }, { data: photos }] = await Promise.all([
    supabase.from('match_ready_checks').select('item, note, done_by, done_at').eq('order_id', orderId),
    supabase.from('garment_photos').select('id, photo_type, photo_url, captured_at').eq('order_id', orderId),
  ]);
  const summary = summarizeMatchReady(checks || [], photos || [], { exempt: order.match_ready_intake_exempt });
  return { order, checks: checks || [], photos: photos || [], summary };
}

/** Adds a check photo (pocket item, stain, return) to the order's Garment Passport. */
export async function addCheckPhoto(
  supabase: AdminClient,
  orderId: string,
  { type, photoUrl, by }: { type: Exclude<MatchReadyPhotoType, 'delivery_proof'>; photoUrl: string; by: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = await resolveAndUploadPhotoUrl(photoUrl, orderId, type);
  if (!url) return { ok: false, error: 'The photo could not be saved. Please take it again.' };
  const notes = type === 'pocket_item' ? 'Found in pockets (Match-Ready Check)' : type === 'stain' ? 'Stain at intake (Match-Ready Check)' : 'Return photo (Match-Ready Check)';
  const { error } = await supabase.from('garment_photos').insert({ order_id: orderId, photo_type: type, photo_url: url, condition_notes: notes, captured_by: by });
  if (error) return { ok: false, error: 'The photo could not be saved. Please try again.' };
  return { ok: true };
}

/** Ticks (or unticks) an item, after checkTickAllowed. */
export async function setCheckItem(
  supabase: AdminClient,
  orderId: string,
  { item, ticked, found, by, now = new Date() }: { item: number; ticked: boolean; found?: boolean; by: string; now?: Date }
): Promise<void> {
  if (!ticked) {
    await supabase.from('match_ready_checks').delete().eq('order_id', orderId).eq('item', item);
    return;
  }
  const note = found === undefined ? null : found ? FOUND_NOTE : NONE_FOUND_NOTE;
  await supabase
    .from('match_ready_checks')
    .upsert({ order_id: orderId, item, note, done_by: by, done_at: now.toISOString() }, { onConflict: 'order_id,item' });
}

/** Item 11: the driver delivered it sealed in the bag, with the delivery photo. */
export async function recordDoorCheck(supabase: AdminClient, orderId: string, by: string, now: Date = new Date()): Promise<void> {
  await supabase
    .from('match_ready_checks')
    .upsert({ order_id: orderId, item: 11, note: null, done_by: by, done_at: now.toISOString() }, { onConflict: 'order_id,item' });
}
