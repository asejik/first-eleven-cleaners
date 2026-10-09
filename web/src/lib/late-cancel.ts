import type { createAdminClient } from '@/lib/supabase/admin';
import { texasDateTime, texasDayStartUtc } from '@/lib/texas-time';
import { FAILED_PICKUP_FEE, LATE_CANCEL_CUTOFF_HOURS, PICKUP_WINDOWS } from '@/lib/constants';
import { getSquareConfig, chargeCardOnFile } from '@/lib/square';
import { reportError } from '@/lib/error-reporting';

/**
 * Late-cancel fee (client 2026-10-08, Part 2 item 4): "cancels or reschedules under 2 hours
 * before the window: $15", the same as the failed-service fee. Zone 5 charges its Extended
 * Reach fee instead. The first one is waived as a courtesy; Routine members get one waived
 * each calendar month instead. Charged to the card on file; staff cancels never pay it.
 * Customers always see the fee and confirm before it is charged.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export interface LateCancelOrder {
  id: string;
  order_number?: string | null;
  customer_id: string;
  pickup_date: string;
  pickup_window: string;
  extended_reach_band?: string | null;
  extended_reach_fee?: number | string | null;
  routine_membership_id?: string | null;
  square_customer_id?: string | null;
  square_card_id?: string | null;
}

export const LATE_CANCEL_ORDER_FIELDS =
  'id, order_number, customer_id, pickup_date, pickup_window, extended_reach_band, extended_reach_fee, routine_membership_id, square_customer_id, square_card_id';

/** Minutes past midnight (Dallas) when a pickup window starts: 7:30 AM -> 450, 5:00 PM -> 1020. */
export function windowStartMinutes(windowId: string): number {
  const start = PICKUP_WINDOWS.find((w) => w.id === windowId)?.start ?? PICKUP_WINDOWS[0].start;
  const [time, half] = start.split(' ');
  const [h, m] = time.split(':').map(Number);
  return ((h % 12) + (half === 'PM' ? 12 : 0)) * 60 + m;
}

/** True from 2 hours before the window starts (Dallas time) on the pickup day, and after. */
export function isLateCancel(order: Pick<LateCancelOrder, 'pickup_date' | 'pickup_window'>, now: Date = new Date()): boolean {
  const tx = texasDateTime(now);
  if (tx.date !== order.pickup_date) return tx.date > order.pickup_date;
  return tx.minutes >= windowStartMinutes(order.pickup_window) - LATE_CANCEL_CUTOFF_HOURS * 60;
}

/** $15, or the order's Extended Reach fee for a Zone 5 pickup. */
export function lateCancelFeeFor(order: Pick<LateCancelOrder, 'extended_reach_band' | 'extended_reach_fee'>): number {
  const reach = Number(order.extended_reach_fee) || 0;
  return order.extended_reach_band && reach > 0 ? reach : FAILED_PICKUP_FEE;
}

export type LateCancelAssessment = { late: false } | { late: true; fee: number; waived: boolean; member: boolean };

/** The first day of this Dallas month, as the UTC instant it starts. */
function monthStartUtc(now: Date): string {
  return texasDayStartUtc(`${texasDateTime(now).date.slice(0, 8)}01`);
}

/** Is the cancel late, what does it cost, and is it waived (first ever; members: first this month)? */
export async function assessLateCancel(supabase: AdminClient, order: LateCancelOrder, now: Date = new Date()): Promise<LateCancelAssessment> {
  if (!isLateCancel(order, now)) return { late: false };
  const fee = lateCancelFeeFor(order);
  let member = Boolean(order.routine_membership_id);
  if (!member) {
    const { data: open } = await supabase.from('routine_memberships').select('id').eq('customer_id', order.customer_id).neq('status', 'cancelled').maybeSingle();
    member = Boolean(open);
  }
  let waivedBefore = supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', order.customer_id)
    .eq('late_cancel_status', 'waived');
  if (member) waivedBefore = waivedBefore.gte('late_cancel_at', monthStartUtc(now));
  const { count } = await waivedBefore;
  return { late: true, fee, waived: (count ?? 0) === 0, member };
}

/** What the customer is told before confirming. */
export function lateCancelWarning(a: Extract<LateCancelAssessment, { late: true }>, verb = 'Cancelling'): string {
  if (a.waived) {
    return a.member
      ? `It's less than ${LATE_CANCEL_CUTOFF_HOURS} hours before your pickup. ${verb} now uses your one free late change this month, so there's no fee.`
      : `It's less than ${LATE_CANCEL_CUTOFF_HOURS} hours before your pickup. Your first late change is free, so there's no fee this time.`;
  }
  return `It's less than ${LATE_CANCEL_CUTOFF_HOURS} hours before your pickup, so ${verb.toLowerCase()} now costs $${a.fee.toFixed(2)}, charged to your card on file.`;
}

export type LateCancelOutcome = { status: 'none' } | { status: 'waived' | 'charged' | 'declined'; fee: number };

/**
 * Records the fee on an order just cancelled late, and charges it (or records the waiver).
 * Call after the cancel (and the hold release). A decline alerts an admin.
 */
export async function applyLateCancelFee(
  supabase: AdminClient,
  order: LateCancelOrder,
  assessment: LateCancelAssessment,
  actor: string,
  now: Date = new Date()
): Promise<LateCancelOutcome> {
  if (!assessment.late) return { status: 'none' };
  const orderRef = order.order_number || order.id.slice(0, 8);
  const record = async (status: 'waived' | 'charged' | 'declined', note: string) => {
    await supabase
      .from('orders')
      .update({ late_cancel_fee: assessment.fee, late_cancel_status: status, late_cancel_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('id', order.id);
    await supabase.from('order_events').insert({ order_id: order.id, status: 'cancelled', note, triggered_by: actor });
  };

  if (assessment.waived) {
    await record('waived', `Late cancel (under ${LATE_CANCEL_CUTOFF_HOURS} hours before the window): $${assessment.fee.toFixed(2)} fee waived (${assessment.member ? "member's free one this month" : 'first one'}).`);
    return { status: 'waived', fee: assessment.fee };
  }

  const squareConfig = getSquareConfig();
  const simulate = !squareConfig.isLive && process.env.NODE_ENV !== 'production';
  let charged: { ok: true; paymentId: string | null } | { ok: false; error: string };
  if (simulate) {
    charged = { ok: true, paymentId: null };
  } else if (!squareConfig.isLive || !order.square_customer_id || !order.square_card_id) {
    charged = { ok: false, error: !squareConfig.isLive ? 'Square is not configured' : 'No card on file for this order' };
  } else {
    const result = await chargeCardOnFile(squareConfig, {
      squareCustomerId: order.square_customer_id,
      cardId: order.square_card_id,
      amount: assessment.fee,
      orderId: order.id,
      orderNumber: orderRef,
      idempotencyKey: `lcf_${order.id.replace(/-/g, '')}`,
    });
    charged = result.ok ? { ok: true, paymentId: result.paymentId } : result;
  }

  if (charged.ok) {
    await supabase.from('order_payments').insert({
      order_id: order.id,
      square_payment_id: charged.paymentId,
      kind: 'late_cancel',
      amount: assessment.fee,
      status: 'completed',
      note: `Late-cancel fee (under ${LATE_CANCEL_CUTOFF_HOURS} hours before the window)`,
    });
    await record('charged', `Late cancel (under ${LATE_CANCEL_CUTOFF_HOURS} hours before the window): $${assessment.fee.toFixed(2)} fee charged.`);
    return { status: 'charged', fee: assessment.fee };
  }
  await record('declined', `Late cancel: the $${assessment.fee.toFixed(2)} fee could not be charged (${charged.error}).`);
  reportError('late-cancel/charge', charged.error, { alert: true, details: `Order ${orderRef}: late-cancel fee of $${assessment.fee.toFixed(2)} not charged` });
  return { status: 'declined', fee: assessment.fee };
}
