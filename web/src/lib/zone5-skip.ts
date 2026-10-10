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
  type LateCancelOrder,
  type LateCancelOutcome,
} from '@/lib/late-cancel';

/**
 * A SKIP text reply. SKIP means one of three things (client 2026-10-10: "as long as it
 * resolves against the last message we sent that customer, we're fine"), so it acts on the
 * order our last text to them was about:
 * - a Routine reminder ("skip this one? Reply SKIP"): skips that automatic pickup; the Routine
 *   carries on (3 in a row pause it);
 * - a Zone 5 text ("Reply SKIP to come off the list"): cancels that Zone 5 pickup;
 * - our late-cancel warning ("Reply SKIP again within 15 minutes to confirm"): confirms it.
 * With no such text on file, the sender's next automatic Routine pickup, else next Zone 5
 * pickup. Under 2 hours before the window the first SKIP only explains the fee; if they don't
 * confirm, the driver still comes. Returns the reply and the order it was about (for the log).
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const SKIP_NOTHING_REPLY = 'First Eleven Cleaners: We could not find an upcoming pickup to skip. Questions? Just reply.';
export const LATE_SKIP_CONFIRM_MINUTES = 15;
const LATE_SKIP_WARNED = 'Late SKIP warned';

type SkipOrder = LateCancelOrder & { status: string; hold_payment_id?: string | null; hold_status?: string | null };
const SKIP_ORDER_FIELDS = `${LATE_CANCEL_ORDER_FIELDS}, status, hold_payment_id, hold_status`;

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
  return `First Eleven Cleaners: ${warning} Reply SKIP again within ${LATE_SKIP_CONFIRM_MINUTES} minutes to confirm. If you don't, our driver will come for your pickup as planned.`;
}

function feeSentence(outcome: LateCancelOutcome): string {
  if (outcome.status === 'charged') return ` The $${outcome.fee.toFixed(2)} late-cancel fee was charged to your card.`;
  if (outcome.status === 'waived') return ' No late-cancel fee this time.';
  if (outcome.status === 'declined') return ` We couldn't charge the $${outcome.fee.toFixed(2)} late-cancel fee; we'll be in touch.`;
  return ' Nothing is charged.';
}

/** Skips one automatic Routine pickup (asking first when it's late). */
async function skipRoutineOrder(supabase: AdminClient, membership: RoutineMembership & { enrolled_order_id: string | null }, pickup: SkipOrder, now: Date): Promise<string | null> {
  const confirmed = await lateSkipConfirmed(supabase, pickup.id, now);
  const decision = await skipAutoPickup(supabase, membership, pickup, now, { confirmLateFee: confirmed, actor: 'Customer (SMS)' });
  if (!decision.ok) {
    if ('code' in decision) {
      const a = await assessLateCancel(supabase, pickup, now);
      if (a.late) return warnLateSkip(supabase, pickup.id, a, now);
    }
    return null;
  }
  const { data: after } = await supabase.from('orders').select('late_cancel_status, late_cancel_fee').eq('id', pickup.id).maybeSingle();
  const outcome: LateCancelOutcome =
    after?.late_cancel_status === 'charged' || after?.late_cancel_status === 'waived' || after?.late_cancel_status === 'declined'
      ? { status: after.late_cancel_status, fee: Number(after.late_cancel_fee) || 0 }
      : { status: 'none' };
  const day = `${weekdayName(pickup.pickup_date).slice(0, 3)} ${shortRunDate(pickup.pickup_date)}`;
  return decision.autoPaused
    ? `First Eleven Cleaners: Done, your ${day} pickup is skipped.${outcome.status === 'none' ? '' : feeSentence(outcome)} That's 3 in a row, so we've paused your Routine. Nothing is charged while it's paused. Resume anytime: ${getAppBaseUrl()}${ROUTINE_PATH}`
    : outcome.status === 'none'
      ? `First Eleven Cleaners: Done, your ${day} pickup is skipped and nothing is charged. Your Routine carries on as usual.`
      : `First Eleven Cleaners: Done, your ${day} pickup is skipped.${feeSentence(outcome)} Your Routine carries on as usual.`;
}

/** Cancels a Zone 5 pickup (asking first when it's late). */
async function leaveZone5Run(supabase: AdminClient, order: SkipOrder, now: Date): Promise<string> {
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

/** The order our last text to these customers was about, when SKIP means something for it. */
async function lastTextedOrder(supabase: AdminClient, customerIds: string[], today: string) {
  const { data: last } = await supabase
    .from('messages')
    .select('order_id')
    .in('customer_id', customerIds)
    .eq('channel', 'sms')
    .eq('direction', 'outbound')
    .not('order_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last?.order_id) return null;
  const { data: order } = await supabase.from('orders').select(SKIP_ORDER_FIELDS).eq('id', last.order_id).maybeSingle();
  if (!order || order.status !== 'booked' || order.pickup_date < today) return null;
  return order as SkipOrder;
}

export interface SkipResult {
  reply: string;
  orderId: string | null;
  customerId: string | null;
}

export async function handleSkipReply(supabase: AdminClient, phoneE164: string, now: Date = new Date()): Promise<SkipResult> {
  // Every record with this number (a guest record and an account can share it)
  const { data: customers } = await supabase.from('customers').select('id').eq('phone', phoneE164).limit(10);
  const customerIds = (customers || []).map((c) => c.id);
  if (customerIds.length === 0) return { reply: SKIP_NOTHING_REPLY, orderId: null, customerId: null };
  const today = texasDate(now);

  // 1. What our last text was about
  const texted = await lastTextedOrder(supabase, customerIds, today);
  if (texted?.routine_membership_id) {
    const { data: membership } = await supabase.from('routine_memberships').select(MEMBERSHIP_FIELDS).eq('id', texted.routine_membership_id).maybeSingle();
    if (membership && membership.status === 'active' && membership.enrolled_order_id !== texted.id) {
      const reply = await skipRoutineOrder(supabase, membership as unknown as RoutineMembership & { enrolled_order_id: string | null }, texted, now);
      if (reply) return { reply, orderId: texted.id, customerId: texted.customer_id };
    }
  }
  if (texted?.extended_reach_band) {
    return { reply: await leaveZone5Run(supabase, texted, now), orderId: texted.id, customerId: texted.customer_id };
  }

  // 2. No such text on file: the next automatic Routine pickup, then the next Zone 5 pickup
  const { data: memberships } = await supabase.from('routine_memberships').select(MEMBERSHIP_FIELDS).in('customer_id', customerIds).eq('status', 'active').limit(5);
  let next: { membership: NonNullable<typeof memberships>[number]; pickup: SkipOrder } | null = null;
  for (const membership of memberships || []) {
    const pickup = (await upcomingAutoPickup(supabase, membership, now)) as SkipOrder | null;
    if (pickup && (!next || pickup.pickup_date < next.pickup.pickup_date)) next = { membership, pickup };
  }
  if (next) {
    const reply = await skipRoutineOrder(supabase, next.membership as unknown as RoutineMembership & { enrolled_order_id: string | null }, next.pickup, now);
    if (reply) return { reply, orderId: next.pickup.id, customerId: next.pickup.customer_id };
  }

  const { data: order } = await supabase
    .from('orders')
    .select(SKIP_ORDER_FIELDS)
    .in('customer_id', customerIds)
    .not('extended_reach_band', 'is', null)
    .eq('status', 'booked')
    .gte('pickup_date', today)
    .order('pickup_date')
    .limit(1)
    .maybeSingle();
  if (!order) return { reply: SKIP_NOTHING_REPLY, orderId: null, customerId: customerIds[0] };
  return { reply: await leaveZone5Run(supabase, order as SkipOrder, now), orderId: order.id, customerId: order.customer_id };
}

/** The reply text only (kept for callers and tests that don't need the log details). */
export async function skipNextZone5Pickup(supabase: AdminClient, phoneE164: string, now: Date = new Date()): Promise<string> {
  return (await handleSkipReply(supabase, phoneE164, now)).reply;
}
