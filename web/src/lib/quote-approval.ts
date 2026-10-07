import type { createAdminClient } from '@/lib/supabase/admin';
import { getSquareConfig, chargeCardOnFile } from '@/lib/square';
import { feeAndTaxOn, DRY_CLEAN_PRICES } from '@/lib/constants';
import { reportError } from '@/lib/error-reporting';

/**
 * Quotes above the 25% band (client 2026-10-06, Parts B-D). The customer approves or
 * declines each quoted item from the private tracking link or their dashboard:
 * - Approve: the item is charged to the card on file (quoted price x quantity, plus the 3%
 *   fee and 8.25% tax) and added to the order's totals. A declined card makes the order
 *   Payment Needed for that amount (the usual ladder), and the work goes ahead.
 * - Decline: the item comes back unaltered at no charge.
 * The rest of the order never waits for this.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export type QuoteDecision = 'approve' | 'decline';
export type QuoteResult = { ok: true; message: string; charged?: number } | { ok: false; status: number; error: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function decideQuote(
  supabase: AdminClient,
  { orderId, itemId, decision, actorLabel }: { orderId: string; itemId: string; decision: QuoteDecision; actorLabel: string }
): Promise<QuoteResult> {
  const { data: item } = await supabase
    .from('order_items')
    .select('id, order_id, garment_type, quantity, quoted_unit_price, quote_status, notes')
    .eq('id', itemId)
    .eq('order_id', orderId)
    .maybeSingle();
  if (!item) return { ok: false, status: 404, error: 'Quote not found.' };
  if (item.quote_status !== 'awaiting_approval') {
    return { ok: false, status: 409, error: 'This quote has already been answered.' };
  }

  const label = DRY_CLEAN_PRICES[item.garment_type]?.label || item.garment_type;
  const quoted = Number(item.quoted_unit_price) || 0;
  const amount = round2(quoted * item.quantity);
  const now = new Date().toISOString();

  // Lock: only one answer per quote, even with two taps
  const { data: locked } = await supabase
    .from('order_items')
    .update({ quote_status: decision === 'approve' ? 'approved' : 'declined', quote_decided_at: now })
    .eq('id', item.id)
    .eq('quote_status', 'awaiting_approval')
    .select('id');
  if (!locked || locked.length === 0) {
    return { ok: false, status: 409, error: 'This quote has already been answered.' };
  }

  if (decision === 'decline') {
    await supabase
      .from('order_items')
      .update({ subtotal: 0, notes: [item.notes, 'Declined by the customer: returned unaltered, no charge'].filter(Boolean).join(' · ') })
      .eq('id', item.id);
    await supabase.from('order_events').insert({
      order_id: orderId,
      status: 'quote_declined',
      note: `Customer declined the quote for ${label} ($${amount.toFixed(2)}). Returned unaltered at no charge.`,
      triggered_by: actorLabel,
    });
    return { ok: true, message: `Got it. Your ${label.toLowerCase()} comes back unaltered at no charge.` };
  }

  // Approve: charge the quoted item with its fee and tax
  const { environmentalFee, salesTax } = feeAndTaxOn(amount);
  const charge = round2(amount + environmentalFee + salesTax);
  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, subtotal, environmental_fee, sales_tax, total, amount_due, payment_status, payment_needed_since, square_customer_id, square_card_id')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return { ok: false, status: 404, error: 'Order not found.' };

  const squareConfig = getSquareConfig();
  let paymentId: string | null = null;
  let failure = '';
  if (squareConfig.isLive) {
    if (order.square_customer_id && order.square_card_id) {
      const result = await chargeCardOnFile(squareConfig, {
        squareCustomerId: order.square_customer_id,
        cardId: order.square_card_id,
        amount: charge,
        orderId,
        orderNumber: order.order_number || orderId.slice(0, 8),
        idempotencyKey: `quo_${item.id.replace(/-/g, '')}`.slice(0, 45),
      });
      if (result.ok && result.status === 'COMPLETED') paymentId = result.paymentId;
      else failure = result.ok ? `Square payment status ${result.status}` : result.error;
    } else {
      failure = 'No card on file for this order';
    }
  } else if (process.env.NODE_ENV !== 'production') {
    paymentId = `sq_txn_sim_${crypto.randomUUID().slice(0, 8)}`; // local development only
  } else {
    failure = 'Square is not configured';
  }

  await supabase.from('order_items').update({ unit_price: quoted, subtotal: amount }).eq('id', item.id);
  const totals = {
    subtotal: round2((Number(order.subtotal) || 0) + amount),
    environmental_fee: round2((Number(order.environmental_fee) || 0) + environmentalFee),
    sales_tax: round2((Number(order.sales_tax) || 0) + salesTax),
    total: round2((Number(order.total) || 0) + charge),
    updated_at: now,
  };

  if (paymentId) {
    await supabase.from('orders').update(totals).eq('id', orderId);
    await supabase.from('order_payments').insert({
      order_id: orderId,
      square_payment_id: paymentId,
      kind: 'quote',
      amount: charge,
      status: 'completed',
      note: `Approved quote: ${label}`,
    });
    await supabase.from('order_events').insert({
      order_id: orderId,
      status: 'quote_approved',
      note: `Customer approved the quote for ${label} ($${amount.toFixed(2)}); charged $${charge.toFixed(2)} with fee and tax (Square ${paymentId}).`,
      triggered_by: actorLabel,
    });
    return { ok: true, charged: charge, message: `Thanks! We've charged $${charge.toFixed(2)} (with fee and tax) and started on your ${label.toLowerCase()}.` };
  }

  // Card declined: the work goes ahead, the order is Payment Needed for this amount
  await supabase
    .from('orders')
    .update({
      ...totals,
      payment_status: 'failed',
      amount_due: round2((Number(order.amount_due) || 0) + charge),
      payment_needed_since: order.payment_needed_since || now,
    })
    .eq('id', orderId);
  await supabase.from('order_payments').insert({ order_id: orderId, kind: 'quote', amount: charge, status: 'failed', note: `Approved quote declined by the card: ${failure}` });
  await supabase.from('order_events').insert({
    order_id: orderId,
    status: 'payment_failed',
    note: `Customer approved the quote for ${label}, but the card was declined for $${charge.toFixed(2)} (${failure}). Order marked Payment Needed.`,
    triggered_by: actorLabel,
  });
  reportError('quotes/charge-declined', failure, { alert: true, details: `Order ${order.order_number || orderId}: approved quote of $${charge.toFixed(2)} declined` });
  return { ok: true, message: `Approved. Your card was declined for $${charge.toFixed(2)}; please add a new card on this page so we can deliver your order.` };
}
