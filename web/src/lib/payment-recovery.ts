import type { createAdminClient } from '@/lib/supabase/admin';
import { getSquareConfig, chargeCardOnFile, getPayment } from '@/lib/square';
import { reportError } from '@/lib/error-reporting';

/**
 * Recovering orders on Payment Hold (P03 PR-04). Intake marks an order `failed` when the
 * saved card is declined. These helpers let staff retry the charge, record a payment taken
 * in the Square Dashboard, or let the customer pay with a new card from the tracking link.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export interface HeldOrder {
  id: string;
  order_number?: string | null;
  total?: number | null;
  /** Still owed after intake captured part of the total (Part A); 0 or missing = the whole total */
  amount_due?: number | null;
  /** The payment already captured at intake, kept as the order's main payment */
  payment_id?: string | null;
  payment_status?: string | null;
  square_customer_id?: string | null;
  square_card_id?: string | null;
}

export type RecoveryResult =
  | { ok: true; paymentId: string; amount: number }
  | { ok: false; status: number; error: string };

/** What a held order still owes: the amount due after a partial capture, else the whole total. */
export function amountOwed(order: Pick<HeldOrder, 'total' | 'amount_due'>): number {
  const due = Number(order.amount_due) || 0;
  return due > 0 ? due : Number(order.total) || 0;
}

/** Fields that clear Payment Needed once the order is paid. */
const PAID_IN_FULL = { amount_due: 0, payment_needed_since: null, payment_reminder_stage: 0 } as const;

/** Square idempotency key (max 45 chars): one attempt per order per minute, so a double click can't charge twice. */
function attemptKey(prefix: string, orderId: string): string {
  return `${prefix}_${orderId.replace(/-/g, '')}_${Math.floor(Date.now() / 60000)}`.slice(0, 45);
}

/**
 * Charges a held order's stored total to a card on file. The order is locked first
 * (`failed` → `pending`), so two attempts can never both charge it; a decline puts it back
 * on hold.
 */
export async function chargeHeldOrder(
  supabase: AdminClient,
  order: HeldOrder,
  {
    card,
    keyPrefix,
    actorLabel,
  }: {
    card?: { squareCustomerId: string; cardId: string };
    keyPrefix: 'rty' | 'pay';
    actorLabel: string;
  }
): Promise<RecoveryResult> {
  const amount = amountOwed(order);
  const squareCustomerId = card?.squareCustomerId || order.square_customer_id || '';
  const cardId = card?.cardId || order.square_card_id || '';

  if (order.payment_status !== 'failed') {
    return { ok: false, status: 409, error: 'This order has no payment needed.' };
  }
  if (amount <= 0) {
    return { ok: false, status: 400, error: 'This order has no amount due.' };
  }

  const squareConfig = getSquareConfig();
  const simulate = !squareConfig.isLive && process.env.NODE_ENV !== 'production';
  if (!squareConfig.isLive && !simulate) {
    return { ok: false, status: 503, error: 'Online payment is temporarily unavailable. Please call us.' };
  }
  if (!simulate && (!squareCustomerId || !cardId)) {
    return { ok: false, status: 400, error: 'No card on file for this order.' };
  }

  // 1. Lock: only one attempt at a time may charge this order
  const { data: locked, error: lockErr } = await supabase
    .from('orders')
    .update({ payment_status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('payment_status', 'failed')
    .select('id');
  if (lockErr) {
    console.error('[Payment recovery] Could not lock order:', lockErr);
    return { ok: false, status: 500, error: 'Could not start the payment. Please try again.' };
  }
  if (!locked || locked.length === 0) {
    return { ok: false, status: 409, error: 'A payment for this order is already in progress or complete.' };
  }

  // 2. Charge
  let paymentId = '';
  let failure = '';
  if (simulate) {
    paymentId = `sq_txn_sim_${crypto.randomUUID().slice(0, 8)}`; // local development only
  } else {
    const charge = await chargeCardOnFile(squareConfig, {
      squareCustomerId,
      cardId,
      amount,
      orderId: order.id,
      orderNumber: order.order_number || order.id.slice(0, 8),
      idempotencyKey: attemptKey(keyPrefix, order.id),
    });
    if (charge.ok && charge.status === 'COMPLETED') {
      paymentId = charge.paymentId;
    } else {
      failure = charge.ok ? `Square payment status ${charge.status}` : charge.error;
    }
  }

  // 3a. Declined: back on hold
  if (!paymentId) {
    await supabase
      .from('orders')
      .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('payment_status', 'pending');
    await supabase.from('order_events').insert({
      order_id: order.id,
      status: 'payment_failed',
      note: `Payment of $${amount.toFixed(2)} declined (${failure}). Order remains Payment Needed.`,
      triggered_by: actorLabel,
    });
    return { ok: false, status: 402, error: `The card was declined: ${failure}` };
  }

  // 3b. Paid. A payment already captured at intake stays the order's main payment; this one
  // is recorded alongside it (Part A)
  const { error: saveErr } = await supabase
    .from('orders')
    .update({
      payment_status: 'charged',
      payment_id: order.payment_id || paymentId,
      ...PAID_IN_FULL,
      ...(card ? { square_customer_id: card.squareCustomerId, square_card_id: card.cardId } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id);
  await supabase.from('order_payments').insert({
    order_id: order.id,
    square_payment_id: paymentId,
    kind: 'charge',
    amount,
    status: 'completed',
    note: keyPrefix === 'pay' ? 'Paid by the customer with a new card (Payment Needed)' : 'Retried by staff (Payment Needed)',
  });
  if (saveErr) {
    // Money moved; make sure staff can reconcile it from the logs
    console.error(`[Payment recovery] Charged order ${order.id} (${paymentId}) but could not save it:`, saveErr);
    reportError('payments/recovery', saveErr, { alert: true, details: `Order ${order.order_number || order.id} was charged (${paymentId}) but not marked paid` });
  }
  await supabase.from('order_events').insert({
    order_id: order.id,
    status: 'charged',
    note: `Payment of $${amount.toFixed(2)} captured via Square (Transaction ID: ${paymentId}). Payment Needed cleared.`,
    triggered_by: actorLabel,
  });
  return { ok: true, paymentId, amount };
}

/**
 * Records a payment the owner took in the Square Dashboard (e.g. by phone). The payment is
 * verified with Square when Square is configured: it must be COMPLETED, cover the order total,
 * and not already be attached to another order.
 */
export async function markHeldOrderPaid(
  supabase: AdminClient,
  order: HeldOrder,
  { squarePaymentId, actorLabel }: { squarePaymentId: string; actorLabel: string }
): Promise<RecoveryResult> {
  const amount = amountOwed(order);
  const paymentId = squarePaymentId.trim();

  if (order.payment_status !== 'failed') {
    return { ok: false, status: 409, error: 'This order has no payment needed.' };
  }
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(paymentId)) {
    return { ok: false, status: 400, error: 'Enter the Square payment ID from the Square Dashboard.' };
  }

  const { data: alreadyUsed } = await supabase
    .from('orders')
    .select('id')
    .eq('payment_id', paymentId)
    .maybeSingle();
  if (alreadyUsed) {
    return { ok: false, status: 409, error: 'That Square payment is already recorded on another order.' };
  }

  const squareConfig = getSquareConfig();
  if (squareConfig.isLive) {
    const payment = await getPayment(squareConfig, paymentId);
    if (!payment.ok) {
      return { ok: false, status: 400, error: `Square could not find that payment: ${payment.error}` };
    }
    if (payment.status !== 'COMPLETED') {
      return { ok: false, status: 400, error: `That Square payment is ${payment.status}, not completed.` };
    }
    if (payment.amountCents - payment.refundedCents < Math.round(amount * 100)) {
      return {
        ok: false,
        status: 400,
        error: `That payment ($${((payment.amountCents - payment.refundedCents) / 100).toFixed(2)}) is less than the amount owed ($${amount.toFixed(2)}).`,
      };
    }
  } else if (process.env.NODE_ENV === 'production') {
    return { ok: false, status: 503, error: 'Square is not configured, so the payment cannot be verified.' };
  }

  const { data: updated, error } = await supabase
    .from('orders')
    .update({ payment_status: 'charged', payment_id: order.payment_id || paymentId, ...PAID_IN_FULL, updated_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('payment_status', 'failed')
    .select('id');
  if (error) {
    console.error('[Payment recovery] Could not record external payment:', error);
    return { ok: false, status: 500, error: 'Could not record the payment. Please try again.' };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, status: 409, error: 'This order was updated by someone else. Refresh and check it.' };
  }

  await supabase.from('order_payments').insert({
    order_id: order.id,
    square_payment_id: paymentId,
    kind: 'charge',
    amount,
    status: 'completed',
    note: 'Taken outside the app and recorded by staff (Payment Needed)',
  });
  await supabase.from('order_events').insert({
    order_id: order.id,
    status: 'charged',
    note: `Payment of $${amount.toFixed(2)} recorded as paid outside the app (Square payment ${paymentId}). Payment Needed cleared.`,
    triggered_by: actorLabel,
  });
  return { ok: true, paymentId, amount };
}
