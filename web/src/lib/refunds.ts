import type { createAdminClient } from '@/lib/supabase/admin';
import { getSquareConfig, refundPayment, getPayment } from '@/lib/square';

/**
 * Refunds (P03 PR-05). Money goes back through Square's Refunds API, and the order's
 * `refunded_amount` / `payment_status` always mirror what Square reports:
 * `refunded` only when the whole payment is refunded, otherwise it stays `charged`.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export interface RefundableOrder {
  id: string;
  order_number?: string | null;
  total?: number | null;
  payment_status?: string | null;
  payment_id?: string | null;
  refunded_amount?: number | null;
}

export type RefundResult =
  | { ok: true; refundId: string; amount: number; refundedTotal: number }
  | { ok: false; status: number; error: string };

const round2 = (n: number) => Number(n.toFixed(2));

/** What can still be refunded on an order's captured payment. */
export function refundableRemaining(order: RefundableOrder): number {
  return Math.max(0, round2((Number(order.total) || 0) - (Number(order.refunded_amount) || 0)));
}

/**
 * Refunds part or all of an order's captured payment. `idempotencyKey` must identify the
 * reason for the refund (e.g. one per claim), so a retried request can't refund twice.
 */
export async function refundOrder(
  supabase: AdminClient,
  order: RefundableOrder,
  {
    amount,
    idempotencyKey,
    reason,
    actorLabel,
  }: { amount: number; idempotencyKey: string; reason: string; actorLabel: string }
): Promise<RefundResult> {
  const refundAmount = round2(amount);
  if (!(refundAmount > 0)) {
    return { ok: false, status: 400, error: 'Enter a refund amount above $0.' };
  }
  if ((order.payment_status !== 'charged' && order.payment_status !== 'refunded') || !order.payment_id) {
    return { ok: false, status: 400, error: 'This order has no captured card payment to refund.' };
  }
  const remaining = refundableRemaining(order);
  if (refundAmount > remaining) {
    return {
      ok: false,
      status: 400,
      error: `Only $${remaining.toFixed(2)} of this order's payment can still be refunded.`,
    };
  }

  const squareConfig = getSquareConfig();
  let refundId: string;
  if (squareConfig.isLive) {
    const refund = await refundPayment(squareConfig, {
      paymentId: order.payment_id,
      amount: refundAmount,
      idempotencyKey,
      reason,
    });
    if (!refund.ok) {
      return { ok: false, status: 402, error: `Square did not accept the refund: ${refund.error}` };
    }
    refundId = refund.refundId;
  } else if (process.env.NODE_ENV !== 'production') {
    refundId = `sim_refund_${crypto.randomUUID().slice(0, 8)}`; // local development only
  } else {
    return { ok: false, status: 503, error: 'Square is not configured, so the refund cannot be issued.' };
  }

  // Record it now; the payments webhook later re-syncs the exact amount from Square
  const refundedTotal = round2((Number(order.refunded_amount) || 0) + refundAmount);
  const fullyRefunded = refundedTotal >= round2(Number(order.total) || 0);
  const { error } = await supabase
    .from('orders')
    .update({
      refunded_amount: refundedTotal,
      payment_status: fullyRefunded ? 'refunded' : 'charged',
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id);
  if (error) {
    console.error(`[Refunds] Square refund ${refundId} issued but order ${order.id} not updated:`, error);
  }

  await supabase.from('order_events').insert({
    order_id: order.id,
    status: 'refund',
    note: `Refund of $${refundAmount.toFixed(2)} issued to the customer's card (Square Refund ${refundId}). Reason: ${reason}`,
    triggered_by: actorLabel,
  });

  return { ok: true, refundId, amount: refundAmount, refundedTotal };
}

/**
 * Re-reads a payment from Square and stores its refunded total on the matching order. Used by
 * the payments webhook so the order mirrors Square no matter which order events arrive in.
 * Returns false when Square isn't configured or the payment can't be read.
 */
export async function syncOrderRefundStateFromSquare(supabase: AdminClient, paymentId: string): Promise<boolean> {
  const squareConfig = getSquareConfig();
  if (!squareConfig.isLive) return false;

  const payment = await getPayment(squareConfig, paymentId);
  if (!payment.ok) {
    console.error(`[Refunds] Could not read Square payment ${paymentId}:`, payment.error);
    return false;
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, payment_status, refunded_amount')
    .eq('payment_id', paymentId)
    .maybeSingle();
  if (!order) return true; // not one of our orders

  if (payment.status !== 'COMPLETED') {
    // FAILED/CANCELED payments are handled by the webhook's status logic
    return true;
  }

  const refundedAmount = round2(payment.refundedCents / 100);
  const nextStatus = payment.amountCents > 0 && payment.refundedCents >= payment.amountCents ? 'refunded' : 'charged';
  if (Number(order.refunded_amount) !== refundedAmount || order.payment_status !== nextStatus) {
    await supabase
      .from('orders')
      .update({ refunded_amount: refundedAmount, payment_status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', order.id);
  }
  return true;
}
