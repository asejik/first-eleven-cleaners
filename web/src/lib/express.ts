import { createAdminClient } from '@/lib/supabase/admin';
import { messagingService } from '@/lib/messaging';
import {
  calculateExpressSurcharge,
  getAppBaseUrl,
  ENVIRONMENTAL_FEE_RATE,
  TX_SALES_TAX_RATE,
} from '@/lib/constants';
import { getSquareConfig, refundPayment } from '@/lib/square';

export interface ExpressSLAResult {
  isExpress: boolean;
  isMissedSLA: boolean;
  refundAmount?: number;
  refundMessage?: string;
  /** 'refunded' once Square accepted the refund; 'manual' when staff must refund by hand */
  refundStatus?: 'refunded' | 'manual';
}

/** Express deliveries are due by 10:00 AM Dallas time on the promised delivery date. */
const SLA_DEADLINE_MINUTES = 10 * 60;

/** Date (YYYY-MM-DD) and minutes past midnight of an instant, in Dallas time. */
function texasDateAndMinutes(instant: Date): { date: string; minutes: number; seconds: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    seconds: Number(parts.second),
  };
}

/** True when delivery happened after 10:00:00 AM Dallas time on the promised date (or any later day). */
export function isExpressDeliveryLate(deliveryDate: string, deliveredAt: Date): boolean {
  const tx = texasDateAndMinutes(deliveredAt);
  if (tx.date !== deliveryDate) return tx.date > deliveryDate;
  return tx.minutes > SLA_DEADLINE_MINUTES || (tx.minutes === SLA_DEADLINE_MINUTES && tx.seconds > 0);
}

/**
 * The amount the customer paid for Express: the surcharge plus the environmental fee and
 * sales tax charged on it. Capped at the order total.
 */
export function expressRefundAmount(surcharge: number, orderTotal?: number | null): number {
  const fee = Number((surcharge * ENVIRONMENTAL_FEE_RATE).toFixed(2));
  const tax = Number(((surcharge + fee) * TX_SALES_TAX_RATE).toFixed(2));
  const amount = Number((surcharge + fee + tax).toFixed(2));
  const cap = Number(orderTotal);
  return cap > 0 ? Math.min(amount, cap) : amount;
}

/**
 * 24-Hour Express guarantee: if delivery missed the 10:00 AM (Dallas) window, refund the
 * Express fee to the customer's card through Square, record it for Mission Control, and only
 * then tell the customer. If the refund can't be made automatically, staff are told instead
 * and the customer is not promised a refund that didn't happen.
 */
export async function handleExpressDeliverySLA(
  order: {
    id: string;
    order_number?: string | null;
    express_tier?: string | null;
    delivery_date?: string | null;
    subtotal?: number | null;
    total?: number | null;
    express_surcharge?: number | null;
    payment_status?: string | null;
    payment_id?: string | null;
    refunded_amount?: number | null;
    customer?: { id?: string; full_name?: string; phone?: string; email?: string } | Array<{ id?: string; full_name?: string; phone?: string; email?: string }> | null;
    express_auto_refunded?: boolean | null;
  },
  deliveryTimestamp: Date = new Date()
): Promise<ExpressSLAResult> {
  if (order.express_tier !== 'express_24hr') {
    return { isExpress: false, isMissedSLA: false };
  }

  if (order.express_auto_refunded) {
    return { isExpress: true, isMissedSLA: true, refundAmount: 0 };
  }

  const deliveryDateStr = order.delivery_date;
  if (!deliveryDateStr) {
    return { isExpress: true, isMissedSLA: false };
  }

  if (!isExpressDeliveryLate(deliveryDateStr, deliveryTimestamp)) {
    return { isExpress: true, isMissedSLA: false };
  }

  // Refund what the customer actually paid for Express (stored at intake), not a recomputation
  const storedSurcharge = Number(order.express_surcharge) || 0;
  const surcharge = storedSurcharge > 0 ? storedSurcharge : calculateExpressSurcharge(Number(order.subtotal) || 0, true);
  const refundAmount = expressRefundAmount(surcharge, order.total);
  const deliveredAtTx = deliveryTimestamp.toLocaleTimeString('en-US', { timeZone: 'America/Chicago' });

  const supabase = createAdminClient();
  const squareConfig = getSquareConfig();

  // 1. Refund through Square. Only a captured payment can be refunded.
  let refundId: string | null = null;
  let failureReason = '';
  if (order.payment_status !== 'charged' || !order.payment_id) {
    failureReason = `payment not captured (status ${order.payment_status || 'unknown'})`;
  } else if (squareConfig.isLive) {
    const refund = await refundPayment(squareConfig, {
      paymentId: order.payment_id,
      amount: refundAmount,
      // One Express refund per order, ever (Square limits keys to 45 characters)
      idempotencyKey: `exr_${order.id.replace(/-/g, '')}`,
      reason: `24-Hour Express missed the 10:00 AM delivery window (Order #${order.order_number || order.id.slice(0, 8)})`,
    });
    if (refund.ok) {
      refundId = refund.refundId;
    } else {
      failureReason = refund.error;
    }
  } else if (process.env.NODE_ENV !== 'production') {
    refundId = `sim_refund_${crypto.randomUUID().slice(0, 8)}`; // local development only
  } else {
    failureReason = 'Square is not configured';
  }

  if (!refundId) {
    console.error(`[Express SLA] Automatic refund failed for order ${order.id}: ${failureReason}`);
    await supabase.from('order_events').insert({
      order_id: order.id,
      status: 'express_refund_failed',
      note: `[EXPRESS SLA MISS: REFUND FAILED] Delivered ${deliveredAtTx} on ${deliveryDateStr}, past the 10:00 AM window. Automatic refund of $${refundAmount.toFixed(2)} failed (${failureReason}). Refund the Express fee manually in Square.`,
      triggered_by: 'Express SLA Automation System',
    });
    return { isExpress: true, isMissedSLA: true, refundAmount, refundStatus: 'manual' };
  }

  // 2. Record the refund. The conditional update stops a second delivery event from re-recording it.
  const { error: updateErr } = await supabase
    .from('orders')
    .update({
      express_auto_refunded: true,
      express_refund_amount: refundAmount,
      refunded_amount: Number(((Number(order.refunded_amount) || 0) + refundAmount).toFixed(2)),
      express_refund_reason: `Delivered ${deliveredAtTx} on ${deliveryDateStr}, past the 10:00 AM window. Refunded $${refundAmount.toFixed(2)} (Square refund ${refundId}).`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .eq('express_auto_refunded', false);
  if (updateErr) {
    console.error('[Express SLA] Could not record express refund on order:', updateErr);
  }

  await supabase.from('order_events').insert({
    order_id: order.id,
    status: 'express_auto_refund',
    note: `[EXPRESS SLA MISS: AUTOMATIC REFUND $${refundAmount.toFixed(2)}] Delivered ${deliveredAtTx} on ${deliveryDateStr}, past the 10:00 AM window. Square refund ${refundId}.`,
    triggered_by: 'Express SLA Automation System',
  });

  // 3. Tell the customer, now that the refund really exists
  const exactNotice = "Your Express delivery ran past our window. The Express fee has been refunded automatically — that's our guarantee.";
  const customerObj = Array.isArray(order.customer) ? order.customer[0] : order.customer;
  const customerPhone = customerObj?.phone || '';

  try {
    await messagingService.dispatchStageNotification({
      orderId: order.id,
      orderNumber: order.order_number || order.id.slice(0, 8),
      customerName: customerObj?.full_name || 'Valued Customer',
      customerPhone,
      customerEmail: customerObj?.email,
      // No phone on file: send by email only
      ...(customerPhone ? {} : { smsConsent: false }),
      stage: 'delivered',
      deliveryDate: deliveryDateStr,
      deliveryWindow: 'morning',
      trackingUrl: `${getAppBaseUrl()}/track/${order.id}`,
      customMessage: exactNotice,
    });
  } catch (notifyErr) {
    console.warn('Could not dispatch express auto-refund notification:', notifyErr);
  }

  return {
    isExpress: true,
    isMissedSLA: true,
    refundAmount,
    refundMessage: exactNotice,
    refundStatus: 'refunded',
  };
}
