import type { createAdminClient } from '@/lib/supabase/admin';
import { texasDate } from '@/lib/texas-time';
import { releaseOrderHold } from '@/lib/payment-capture';
import { getAppBaseUrl } from '@/lib/constants';
import { shortRunDate } from '@/lib/zone5-messages';
import { MEMBERSHIP_FIELDS, skipAutoPickup, upcomingAutoPickup } from '@/lib/routine-store';
import { weekdayName, ROUTINE_PATH, type RoutineMembership } from '@/lib/routine';

/**
 * A SKIP text reply (client 2026-10-08):
 * - A Routine member's reminder ("skip this one? Reply SKIP"): skips their next automatic
 *   pickup; the Routine carries on (3 in a row pause it).
 * - Otherwise the Zone 5 "route not reached" text ("Reply SKIP to come off the list"): cancels
 *   the sender's next Zone 5 pickup while it is still only booked, and releases any card hold.
 * Returns the reply to text back.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const SKIP_NOTHING_REPLY = 'First Eleven Cleaners: We could not find an upcoming pickup to skip. Questions? Just reply.';

/** The sender's next automatic Routine pickup, skipped; null when they have none. */
async function skipRoutinePickup(supabase: AdminClient, customerIds: string[], now: Date): Promise<string | null> {
  const { data: memberships } = await supabase.from('routine_memberships').select(MEMBERSHIP_FIELDS).in('customer_id', customerIds).eq('status', 'active').limit(5);
  let next: { membership: NonNullable<typeof memberships>[number]; pickup: { pickup_date: string } } | null = null;
  for (const membership of memberships || []) {
    const pickup = await upcomingAutoPickup(supabase, membership, now);
    if (pickup && (!next || pickup.pickup_date < next.pickup.pickup_date)) next = { membership, pickup };
  }
  if (!next) return null;
  const decision = await skipAutoPickup(supabase, next.membership as unknown as RoutineMembership & { enrolled_order_id: string | null }, next.pickup, now);
  if (!decision.ok) return null;
  const day = `${weekdayName(next.pickup.pickup_date).slice(0, 3)} ${shortRunDate(next.pickup.pickup_date)}`;
  return decision.autoPaused
    ? `First Eleven Cleaners: Done, your ${day} pickup is skipped. That's 3 in a row, so we've paused your Routine. Nothing is charged while it's paused. Resume anytime: ${getAppBaseUrl()}${ROUTINE_PATH}`
    : `First Eleven Cleaners: Done, your ${day} pickup is skipped and nothing is charged. Your Routine carries on as usual.`;
}

export async function skipNextZone5Pickup(supabase: AdminClient, phoneE164: string, now: Date = new Date()): Promise<string> {
  // Every record with this number (a guest record and an account can share it)
  const { data: customers } = await supabase.from('customers').select('id').eq('phone', phoneE164).limit(10);
  const customerIds = (customers || []).map((c) => c.id);
  if (customerIds.length === 0) return SKIP_NOTHING_REPLY;

  const routineReply = await skipRoutinePickup(supabase, customerIds, now);
  if (routineReply) return routineReply;

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, pickup_date, hold_payment_id, hold_status')
    .in('customer_id', customerIds)
    .not('extended_reach_band', 'is', null)
    .eq('status', 'booked')
    .gte('pickup_date', texasDate(now))
    .order('pickup_date')
    .limit(1)
    .maybeSingle();
  if (!order) return SKIP_NOTHING_REPLY;

  const { data: cancelled } = await supabase
    .from('orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('status', 'booked')
    .select('id');
  if (!cancelled || cancelled.length === 0) return SKIP_NOTHING_REPLY;

  await supabase.from('order_events').insert({
    order_id: order.id,
    status: 'cancelled',
    note: 'Extended Reach pickup cancelled by the customer (replied SKIP).',
    triggered_by: 'Customer (SMS)',
    timestamp: new Date().toISOString(),
  });
  await releaseOrderHold(supabase, order, 'pickup skipped by the customer by text');
  return `First Eleven Cleaners: Done. Your Extended Reach pickup on Wed ${shortRunDate(order.pickup_date)} is cancelled and nothing is charged. Book again anytime: ${getAppBaseUrl()}/book`;
}
