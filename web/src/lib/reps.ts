import type { createAdminClient } from '@/lib/supabase/admin';

/**
 * Rep codes (client 2026-10-14): TERRITORY-WAVE-REP, e.g. 1D-W1-JM. The owner keeps the list
 * in Mission Control (add, switch off). A customer enters one at signup or booking (or a
 * rep's card links /book?rep=CODE); it's stamped on the customer (the first one stays, so
 * it can't be added or changed later) and on the order. A rep code and a friend's referral
 * code can both be used: one pays the rep, the other is the friend's money. A wrong or
 * switched-off code never blocks a booking; it's just not stamped.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const REP_CODE_PATTERN = /^[0-9A-Z]{1,4}-W[0-9]{1,3}-[A-Z]{2,4}$/;

/** "1d w1 jm", "1D-W1-JM " -> "1D-W1-JM"; anything else as typed, upper-cased. */
export function normalizeRepCode(raw: string | null | undefined): string {
  const cleaned = String(raw ?? '').toUpperCase().replace(/[^0-9A-Z-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned.slice(0, 20);
}

export function parseRepCode(code: string): { territory: string; wave: string; rep: string } | null {
  if (!REP_CODE_PATTERN.test(code)) return null;
  const [territory, wave, rep] = code.split('-');
  return { territory, wave, rep };
}

/** The active rep for a code, if any. */
export async function findActiveRep(supabase: AdminClient, raw: string | null | undefined): Promise<{ code: string; territory_id: string } | null> {
  const code = normalizeRepCode(raw);
  if (!parseRepCode(code)) return null;
  const { data } = await supabase.from('reps').select('code, territory_id, active').eq('code', code).maybeSingle();
  return data?.active ? { code: data.code, territory_id: data.territory_id } : null;
}

/** Stamps the code on the order, and on the customer if they have none yet. */
export async function stampRepCode(
  supabase: AdminClient,
  { code, customerId, orderId, now = new Date() }: { code: string; customerId: string; orderId?: string | null; now?: Date }
): Promise<void> {
  if (orderId) await supabase.from('orders').update({ rep_code: code }).eq('id', orderId);
  await supabase.from('customers').update({ rep_code: code, rep_code_at: now.toISOString() }).eq('id', customerId).is('rep_code', null);
}
