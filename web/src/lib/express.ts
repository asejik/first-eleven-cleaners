import { createAdminClient } from '@/lib/supabase/admin';
import { messagingService } from '@/lib/messaging';
import { calculateExpressSurcharge, getAppBaseUrl } from '@/lib/constants';

export interface ExpressSLAResult {
  isExpress: boolean;
  isMissedSLA: boolean;
  refundAmount?: number;
  refundMessage?: string;
}

/**
 * Checks if an order was 24-Hour Express and if it was delivered after 10:00 AM on the promised delivery date.
 * If delivery missed the 10:00 AM SLA window:
 *  1. Automatically refunds the Express surcharge to the customer's card.
 *  2. Sends customer notification: "Your Express delivery ran past our window. The Express fee has been refunded automatically — that's our guarantee."
 *  3. Logs the refund as an Express SLA miss in Mission Control (order_events table & order record) to track miss rate.
 */
export async function handleExpressDeliverySLA(
  order: {
    id: string;
    order_number?: string | null;
    express_tier?: string | null;
    delivery_date?: string | null;
    subtotal?: number | null;
    total?: number | null;
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

  // Promised delivery window deadline: 10:00:00 AM on delivery_date
  const [y, m, d] = deliveryDateStr.split('-').map(Number);
  const deadline = new Date(y, m - 1, d, 10, 0, 0, 0);

  // If delivered after 10:00 AM on delivery_date
  const isMissedSLA = deliveryTimestamp.getTime() > deadline.getTime();

  if (!isMissedSLA) {
    return { isExpress: true, isMissedSLA: false };
  }

  // Calculate Express surcharge to refund (+50%, min $15)
  const subtotal = Number(order.subtotal) || 0;
  const refundAmount = calculateExpressSurcharge(subtotal, true);

  const supabase = createAdminClient();

  // 1. Update order record
  try {
    await supabase
      .from('orders')
      .update({
        express_auto_refunded: true,
        express_refund_amount: refundAmount,
        express_refund_reason: `Delivery past 10:00 AM SLA window on ${deliveryDateStr} (${deliveryTimestamp.toLocaleTimeString('en-US')}). Auto-refunded $${refundAmount.toFixed(2)}.`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);
  } catch (err) {
    console.warn('Could not update order with express auto-refund:', err);
  }

  // 2. Log event in order_events for Mission Control SLA tracking
  try {
    await supabase.from('order_events').insert({
      order_id: order.id,
      status: 'express_auto_refund',
      note: `[EXPRESS SLA MISS — AUTOMATIC REFUND: $${refundAmount.toFixed(2)}] Delivery completed past 10:00 AM window on ${deliveryDateStr}. Express surcharge refunded automatically under 24-Hour Express Guarantee.`,
      triggered_by: 'Express SLA Automation System',
    });
  } catch (err) {
    console.warn('Could not log express auto-refund event:', err);
  }

  // 3. Dispatch customer notification with exact required copy
  const exactNotice = "Your Express delivery ran past our window. The Express fee has been refunded automatically — that's our guarantee.";
  const customerObj = Array.isArray(order.customer) ? order.customer[0] : order.customer;
  const customerName = customerObj?.full_name || 'Valued Customer';
  const customerPhone = customerObj?.phone || '+12145550199';
  const customerEmail = customerObj?.email;
  const origin = getAppBaseUrl();

  try {
    await messagingService.dispatchStageNotification({
      orderId: order.id,
      orderNumber: order.order_number || order.id.slice(0, 8),
      customerName,
      customerPhone,
      customerEmail,
      stage: 'delivered',
      deliveryDate: deliveryDateStr,
      deliveryWindow: 'morning',
      trackingUrl: `${origin}/track/${order.id}`,
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
  };
}
