import type { createAdminClient } from '@/lib/supabase/admin';
import { texasDate } from '@/lib/texas-time';
import { releaseOrderHold } from '@/lib/payment-capture';
import { getAppBaseUrl } from '@/lib/constants';
import { shortRunDate } from '@/lib/zone5-messages';
import { MEMBERSHIP_FIELDS, skipAutoPickup, upcomingAutoPickup } from '@/lib/routine-store';
import { weekdayName, ROUTINE_PATH, type RoutineMembership } from '@/lib/routine';
import {
  assessLateCancel,
  applyLateCancelFee,
  lateCancelWarning,
  LATE_CANCEL_ORDER_FIELDS,
  type LateCancelAssessment,
  type LateCancelOutcome,
} from '@/lib/late-cancel';

/**
 * A SKIP text reply (client 2026-10-08):
 * - A Routine member's reminder ("skip this one? Reply SKIP"): skips their next automatic
 *   pickup; the Routine carries on (3 in a row pause it).
 * - Otherwise the Zone 5 "route not reached" text ("Reply SKIP to come off the list"): cancels
 *   the sender's next Zone 5 pickup while it is still only booked, and releases any card hold.
 * Under 2 hours before the window (late-cancel fee, item 4) the first SKIP only explains the
 * fee; a second SKIP within 15 minutes confirms it. Returns the reply to text back.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const SKIP_NOTHING_REPLY = 'First Eleven Cleaners: We could not find an upcoming pickup to skip. Questions? Just reply.';
export const LATE_SKIP_CONFIRM_MINUTES = 15;
const LATE_SKIP_WARNED = 'Late SKIP warned';

/** Did we explain the fee for this pickup in the last 15 minutes (so this SKIP confirms it)? */
async function lateSkipConfirmed(supabase: AdminClient, orderId: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - LATE_SKIP_CONFIRM_MINUTES * 60_000).toISOString();
  const { data } = await supabase
    .from('order_events')
    .select('id')
    .eq('order_id', orderId)
    .like('note', `${LATE_SKIP_WARNED}%`)
    .gte('timestamp', since)
    .limit(1);
  return Boolean(data && data.length > 0);
}

async function warnLateSkip(supabase: AdminClient, orderId: string, a: Extract<LateCancelAssessment, { late: true }>, now: Date): Promise<string> {
  const warning = lateCancelWarning(a, 'Skipping');
  await supabase.from('order_events').insert({ order_id: orderId, status: 'booked', note: `${LATE_SKIP_WARNED}: ${warning}`, triggered_by: 'Customer (SMS)', timestamp: now.toISOString() });
  return `First Eleven Cleaners: ${warning} Reply SKIP again within ${LATE_SKIP_CONFIRM_MINUTES} minutes to confirm.`;
}

function feeSentence(outcome: LateCancelOutcome): string {
  if (outcome.status === 'charged') return ` The $${outcome.fee.toFixed(2)} late-cancel fee was charged to your card.`;
  if (outcome.status === 'waived') return ' No late-cancel fee this time.';
  if (outcome.status === 'declined') return ` We couldn't charge the $${outcome.fee.toFixed(2)} late-cancel fee; we'll be in touch.`;
  return ' Nothing is charged.';
}

/** The sender's next automatic Routine pickup, skipped; null when they have none. */
async function skipRoutinePickup(supabase: AdminClient, customerIds: string[], now: Date): Promise<string | null> {
  const { data: memberships } = await supabase.from('routine_memberships').select(MEMBERSHIP_FIELDS).in('customer_id', customerIds).eq('status', 'active').limit(5);
  let next: { membership: NonNullable<typeof memberships>[number]; pickup: NonNullable<Awaited<ReturnType<typeof upcomingAutoPickup>>> } | null = null;
  for (const membership of memberships || []) {
    const pickup = await upcomingAutoPickup(supabase, membership, now);
    if (pickup && (!next || pickup.pickup_date < next.pickup.pickup_date)) next = { membership, pickup };
  }
  if (!next) return null;
  const member = next.membership as unknown as RoutineMembership & { enrolled_order_id: string | null };
  const confirmed = await lateSkipConfirmed(supabase, next.pickup.id, now);
  const decision = await skipAutoPickup(supabase, member, next.pickup, now, { confirmLateFee: confirmed, actor: 'Customer (SMS)' });
  if (!decision.ok) {
    if ('code' in decision) {
      const a = await assessLateCancel(supabase, next.pickup, now);
      if (a.late) return warnLateSkip(supabase, next.pickup.id, a, now);
    }
    return null;
  }
  const { data: after } = await supabase.from('orders').select('late_cancel_status, late_cancel_fee').eq('id', next.pickup.id).maybeSingle();
  const outcome: LateCancelOutcome =
    after?.late_cancel_status === 'charged' || after?.late_cancel_status === 'waived' || after?.late_cancel_status === 'declined'
      ? { status: after.late_cancel_status, fee: Number(after.late_cancel_fee) || 0 }
      : { status: 'none' };
  const day = `${weekdayName(next.pickup.pickup_date).slice(0, 3)} ${shortRunDate(next.pickup.pickup_date)}`;
  return decision.autoPaused
    ? `First Eleven Cleaners: Done, your ${day} pickup is skipped.${outcome.status === 'none' ? '' : feeSentence(outcome)} That's 3 in a row, so we've paused your Routine. Nothing is charged while it's paused. Resume anytime: ${getAppBaseUrl()}${ROUTINE_PATH}`
    : outcome.status === 'none'
      ? `First Eleven Cleaners: Done, your ${day} pickup is skipped and nothing is charged. Your Routine carries on as usual.`
      : `First Eleven Cleaners: Done, your ${day} pickup is skipped.${feeSentence(outcome)} Your Routine carries on as usual.`;
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
    .select(`${LATE_CANCEL_ORDER_FIELDS}, hold_payment_id, hold_status`)
    .in('customer_id', customerIds)
    .not('extended_reach_band', 'is', null)
    .eq('status', 'booked')
    .gte('pickup_date', texasDate(now))
    .order('pickup_date')
    .limit(1)
    .maybeSingle();
  if (!order) return SKIP_NOTHING_REPLY;

  // Under 2 hours before the window: explain the fee first; a second SKIP confirms
  const lateFee = await assessLateCancel(supabase, order, now);
  if (lateFee.late && !(await lateSkipConfirmed(supabase, order.id, now))) return warnLateSkip(supabase, order.id, lateFee, now);

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
  const outcome = await applyLateCancelFee(supabase, order, lateFee, 'Customer (SMS)', now);
  return `First Eleven Cleaners: Done. Your Extended Reach pickup on Wed ${shortRunDate(order.pickup_date)} is cancelled.${feeSentence(outcome)} Book again anytime: ${getAppBaseUrl()}/book`;
}
