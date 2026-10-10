import type { createAdminClient } from '@/lib/supabase/admin';
import { ROUTINE_PLAN_DISCOUNT_PERCENT, type PlanFrequency } from '@/lib/constants';
import { reportError } from '@/lib/error-reporting';

/**
 * Territories and Founding 111 (client 2026-10-10).
 * - A territory is a named group of ZIPs set up in Mission Control; each ZIP belongs to one
 *   (seeded from the client's list: Zone 1 in several, Zones 2-4 one each, each Zone 5 city
 *   its own). The founder counter runs per territory.
 * - The first 111 Routine members in a territory are its Founding members: a numbered badge
 *   (and numbered bag), lifetime pricing (their plan discount rate is locked for life, and
 *   they're exempt from any membership fee ever added; prices follow the rate card), and
 *   priority windows (first pick: they can book a day further ahead than everyone else).
 * - Status survives pauses; a cancel ends it, with 60 days to come back
 *   (claim_founding_number() in the database).
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const FOUNDING_LIMIT = 111;
export const FOUNDING_RETURN_DAYS = 60;
/** Founders see each route day's windows 24 hours before everyone else. */
export const FOUNDER_HEAD_START_DAYS = 1;

export interface Territory {
  id: string;
  name: string;
  zone_id: string;
}

export interface FounderStatus {
  number: number;
  territoryId: string;
  territoryName: string;
  lockedRates: { weekly: number; biweekly: number };
  active: boolean;
}

export async function territoryForZip(supabase: AdminClient, zip: string): Promise<Territory | null> {
  const zip5 = String(zip || '').replace(/\D/g, '').slice(0, 5);
  if (zip5.length !== 5) return null;
  const { data: link } = await supabase.from('territory_zips').select('territory_id').eq('zip', zip5).maybeSingle();
  if (!link) return null;
  const { data: territory } = await supabase.from('territories').select('id, name, zone_id').eq('id', link.territory_id).maybeSingle();
  return territory ?? null;
}

/** A customer's founder status (active: their membership is open or paused). */
export async function founderStatus(supabase: AdminClient, customerId: string): Promise<FounderStatus | null> {
  const { data: founder } = await supabase
    .from('founding_members')
    .select('number, territory_id, locked_weekly_percent, locked_biweekly_percent, ended_at')
    .eq('customer_id', customerId)
    .maybeSingle();
  if (!founder) return null;
  const { data: territory } = await supabase.from('territories').select('name').eq('id', founder.territory_id).maybeSingle();
  return {
    number: founder.number,
    territoryId: founder.territory_id,
    territoryName: territory?.name ?? founder.territory_id,
    lockedRates: { weekly: founder.locked_weekly_percent, biweekly: founder.locked_biweekly_percent },
    active: !founder.ended_at,
  };
}

/** The plan discount a member gets: a founder's locked rate, else today's rate. */
export function planDiscountFor(frequency: PlanFrequency, founder: Pick<FounderStatus, 'lockedRates' | 'active'> | null): number {
  if (frequency === 'one_time') return 0;
  return founder?.active ? founder.lockedRates[frequency] : ROUTINE_PLAN_DISCOUNT_PERCENT[frequency];
}

/** On joining (or rejoining within 60 days): the next founder number in the address's territory. */
export async function claimFounding(supabase: AdminClient, b: { customerId: string; membershipId: string; zip: string }): Promise<FounderStatus | null> {
  const territory = await territoryForZip(supabase, b.zip);
  if (!territory) return null;
  const { data, error } = await supabase.rpc('claim_founding_number', {
    p_territory: territory.id,
    p_customer: b.customerId,
    p_membership: b.membershipId,
    p_weekly: ROUTINE_PLAN_DISCOUNT_PERCENT.weekly,
    p_biweekly: ROUTINE_PLAN_DISCOUNT_PERCENT.biweekly,
  });
  if (error) {
    reportError('founding/claim', error, { details: `Customer ${b.customerId}: founder number not claimed` });
    return null;
  }
  if (typeof data !== 'number') return null;
  return founderStatus(supabase, b.customerId);
}

/** A cancel ends founder status (60 days to come back); a pause doesn't. */
export async function endFounding(supabase: AdminClient, customerId: string, now: Date = new Date()): Promise<void> {
  await supabase.from('founding_members').update({ ended_at: now.toISOString() }).eq('customer_id', customerId).is('ended_at', null);
}

export function founderBadge(f: Pick<FounderStatus, 'number' | 'territoryName'>): string {
  return `Founding Member #${f.number} · ${f.territoryName}`;
}
