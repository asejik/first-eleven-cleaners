import type { createAdminClient } from '@/lib/supabase/admin';
import {
  getSquareConfig,
  chargeCardOnFile,
  updateHoldAmount,
  completeHold,
  cancelHold,
} from '@/lib/square';
import { planCapture, isHoldActive } from '@/lib/payment-hold';
import { reportError } from '@/lib/error-reporting';

/**
 * Intake's automatic charge (client 2026-10-06, Part A: "see it as you pay it"). The actual
 * total is captured with no approval and no waiting:
 * - at or below the hold: the hold is lowered to the total and captured;
 * - above the hold: the whole hold is captured and the rest charged to the card on file;
 * - no usable hold (none placed, expired, released): the card on file is charged.
 * Anything Square declines becomes Payment Needed for the amount still owed: cleaning goes
 * on, delivery waits until it's paid.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export interface CaptureOrder {
  id: string;
  order_number?: string | null;
  square_customer_id?: string | null;
  square_card_id?: string | null;
  hold_payment_id?: string | null;
  hold_amount?: number | null;
  hold_status?: string | null;
  hold_expires_at?: string | null;
}

export interface CaptureResult {
  paymentStatus: 'charged' | 'failed';
  /** The main captured Square payment (the hold, or the card-on-file charge) */
  paymentId: string | null;
  /** Still owed after this attempt (0 when fully paid) */
  amountDue: number;
  /** New hold_status, when the hold changed */
  holdStatus?: 'captured' | 'released' | 'expired';
  /** Timeline note for order_events */
  note: string;
  failureReason?: string;
}

const money = (n: number) => `$${n.toFixed(2)}`;
const centsKey = (n: number) => Math.round(n * 100);

export async function captureOrderPayment(
  supabase: AdminClient,
  order: CaptureOrder,
  total: number
): Promise<CaptureResult> {
  const squareConfig = getSquareConfig();
  const orderRef = order.order_number || order.id.slice(0, 8);
  const compactId = order.id.replace(/-/g, '');

  if (!squareConfig.isLive) {
    if (process.env.NODE_ENV === 'production') {
      return { paymentStatus: 'failed', paymentId: null, amountDue: total, failureReason: 'Square is not configured', note: `Payment of ${money(total)} could not be taken: Square is not configured. Order marked Payment Needed.` };
    }
    // Local development only
    const simulated = `sq_txn_sim_${crypto.randomUUID().slice(0, 8)}`;
    return { paymentStatus: 'charged', paymentId: simulated, amountDue: 0, note: `[DEV SIMULATION] Payment of ${money(total)} simulated. (Transaction ID: ${simulated})` };
  }

  const record = async (row: { square_payment_id: string | null; kind: 'hold' | 'top_up' | 'charge'; amount: number; status: 'completed' | 'failed' | 'canceled'; note: string }) => {
    if (row.kind === 'hold' && row.square_payment_id) {
      await supabase
        .from('order_payments')
        .update({ amount: row.amount, status: row.status, note: row.note, updated_at: new Date().toISOString() })
        .eq('square_payment_id', row.square_payment_id);
      return;
    }
    await supabase.from('order_payments').insert({ order_id: order.id, ...row });
  };

  /** Charges an amount to the card on file (no usable hold, or the rest above the hold). */
  const chargeCard = async (amount: number, kind: 'charge' | 'top_up') => {
    if (!order.square_customer_id || !order.square_card_id) {
      return { ok: false as const, error: 'No card on file for this order' };
    }
    const charge = await chargeCardOnFile(squareConfig, {
      squareCustomerId: order.square_customer_id,
      cardId: order.square_card_id,
      amount,
      orderId: order.id,
      orderNumber: orderRef,
      idempotencyKey: kind === 'top_up' ? `top_${compactId}_${centsKey(amount)}`.slice(0, 45) : undefined,
    });
    if (charge.ok && charge.status === 'COMPLETED') {
      await record({ square_payment_id: charge.paymentId, kind, amount, status: 'completed', note: kind === 'top_up' ? 'Charged above the hold at intake' : 'Charged to the card on file at intake' });
      return { ok: true as const, paymentId: charge.paymentId };
    }
    const error = charge.ok ? `Square payment status ${charge.status}` : charge.error;
    await record({ square_payment_id: null, kind, amount, status: 'failed', note: `Declined at intake: ${error}` });
    return { ok: false as const, error };
  };

  const failed = (amountDue: number, reason: string, extra: Partial<CaptureResult> = {}): CaptureResult => {
    reportError('intake/payment-needed', reason, { alert: true, details: `Order ${orderRef} needs payment of ${money(amountDue)}` });
    return {
      paymentStatus: 'failed',
      paymentId: null,
      amountDue,
      failureReason: reason,
      note: `Automatic payment of ${money(amountDue)} failed (${reason}). Order marked Payment Needed: cleaning continues, delivery waits until paid.`,
      ...extra,
    };
  };

  const plan = planCapture({ total, holdAmount: order.hold_amount, holdActive: isHoldActive(order) });
  const holdId = order.hold_payment_id || '';

  if (plan.kind === 'capture_hold') {
    if (plan.lowerHold) {
      const lowered = await updateHoldAmount(squareConfig, {
        paymentId: holdId,
        amount: plan.captureAmount,
        idempotencyKey: `low_${compactId}_${centsKey(plan.captureAmount)}`.slice(0, 45),
      });
      if (!lowered.ok) {
        // Never capture more than the total: release the hold and charge the card instead
        await cancelHold(squareConfig, holdId);
        await record({ square_payment_id: holdId, kind: 'hold', amount: Number(order.hold_amount) || 0, status: 'canceled', note: `Released at intake: could not lower it (${lowered.error})` });
        const charge = await chargeCard(total, 'charge');
        return charge.ok
          ? { paymentStatus: 'charged', paymentId: charge.paymentId, amountDue: 0, holdStatus: 'released', note: `Hold couldn't be lowered, so it was released; ${money(total)} charged to the card on file via Square. (Transaction ID: ${charge.paymentId})` }
          : failed(total, charge.error, { holdStatus: 'released' });
      }
    }
    const captured = await completeHold(squareConfig, holdId);
    if (captured.ok) {
      await record({ square_payment_id: holdId, kind: 'hold', amount: plan.captureAmount, status: 'completed', note: 'Captured at intake' });
      return {
        paymentStatus: 'charged',
        paymentId: holdId,
        amountDue: 0,
        holdStatus: 'captured',
        note: `Payment of ${money(plan.captureAmount)} captured from the card hold via Square${plan.lowerHold ? ` (hold of ${money(Number(order.hold_amount) || 0)} lowered to the actual total)` : ''}. (Transaction ID: ${holdId})`,
      };
    }
    // The hold can't be captured (e.g. Square already cancelled it): charge the card instead
    await record({ square_payment_id: holdId, kind: 'hold', amount: Number(order.hold_amount) || 0, status: 'canceled', note: `Could not be captured: ${captured.error}` });
    const charge = await chargeCard(total, 'charge');
    return charge.ok
      ? { paymentStatus: 'charged', paymentId: charge.paymentId, amountDue: 0, holdStatus: 'expired', note: `Hold could not be captured (${captured.error}); ${money(total)} charged to the card on file via Square. (Transaction ID: ${charge.paymentId})` }
      : failed(total, charge.error, { holdStatus: 'expired' });
  }

  if (plan.kind === 'capture_hold_and_charge_rest') {
    const captured = await completeHold(squareConfig, holdId);
    if (!captured.ok) {
      await record({ square_payment_id: holdId, kind: 'hold', amount: Number(order.hold_amount) || 0, status: 'canceled', note: `Could not be captured: ${captured.error}` });
      const charge = await chargeCard(total, 'charge');
      return charge.ok
        ? { paymentStatus: 'charged', paymentId: charge.paymentId, amountDue: 0, holdStatus: 'expired', note: `Hold could not be captured (${captured.error}); ${money(total)} charged to the card on file via Square. (Transaction ID: ${charge.paymentId})` }
        : failed(total, charge.error, { holdStatus: 'expired' });
    }
    await record({ square_payment_id: holdId, kind: 'hold', amount: plan.captureAmount, status: 'completed', note: 'Captured in full at intake' });
    const rest = await chargeCard(plan.rest, 'top_up');
    if (rest.ok) {
      return {
        paymentStatus: 'charged',
        paymentId: holdId,
        amountDue: 0,
        holdStatus: 'captured',
        note: `Payment of ${money(total)} taken via Square: ${money(plan.captureAmount)} captured from the card hold (${holdId}) and ${money(plan.rest)} charged to the card on file (${rest.paymentId}).`,
      };
    }
    // The hold is paid; only the rest is owed
    return {
      ...failed(plan.rest, rest.error, { holdStatus: 'captured' }),
      paymentId: holdId,
      note: `${money(plan.captureAmount)} captured from the card hold (${holdId}); the remaining ${money(plan.rest)} was declined (${rest.error}). Order marked Payment Needed for ${money(plan.rest)}: cleaning continues, delivery waits until paid.`,
    };
  }

  const charge = await chargeCard(plan.amount, 'charge');
  return charge.ok
    ? { paymentStatus: 'charged', paymentId: charge.paymentId, amountDue: 0, note: `Payment of ${money(plan.amount)} charged to the card on file via Square. (Transaction ID: ${charge.paymentId})` }
    : failed(plan.amount, charge.error);
}
