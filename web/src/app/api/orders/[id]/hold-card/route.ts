import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { getSquareConfig, saveCardOnFile, createHold } from '@/lib/square';
import { apiError } from '@/lib/api-errors';

/**
 * New card for an upcoming pickup whose card hold was declined 2 days before pickup
 * (client 2026-10-06, Part A). The card is saved with Square and the hold placed on it;
 * nothing is charged until intake.
 *
 * Reached from the tracking link, which carries the unguessable order UUID (the same access
 * as the pay link). Rate-limited per network and per order so it can't be used to test cards.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ONE_HOUR = 60 * 60 * 1000;

const HoldCardSchema = z.object({
  card_token: z.string().min(8, 'Please enter your card details.').max(500),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const clientIp = getClientIp(request);
    const [ipCheck, orderCheck] = await Promise.all([
      checkRateLimitAsync(`order_hold_card_ip:${clientIp}`, 10, ONE_HOUR),
      checkRateLimitAsync(`order_hold_card_order:${id}`, 5, ONE_HOUR),
    ]);
    if (!ipCheck.allowed || !orderCheck.allowed) {
      return NextResponse.json({ error: 'Too many attempts. Please wait an hour or call us.' }, { status: 429 });
    }

    const parsed = HoldCardSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Please enter your card details.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, status, hold_status, hold_amount, customer_id, square_customer_id')
      .eq('id', id)
      .maybeSingle();
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    if (order.status !== 'booked' || order.hold_status !== 'declined') {
      return NextResponse.json({ error: 'This order does not need a new card.' }, { status: 409 });
    }

    const squareConfig = getSquareConfig();
    if (!squareConfig.isLive) {
      return NextResponse.json({ error: 'Online card updates are unavailable right now. Please call us.' }, { status: 503 });
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('id, full_name, email, square_customer_id')
      .eq('id', order.customer_id)
      .maybeSingle();
    if (!customer) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const saved = await saveCardOnFile(squareConfig, {
      cardToken: parsed.data.card_token,
      existingSquareCustomerId: order.square_customer_id || customer.square_customer_id,
      email: customer.email,
      fullName: customer.full_name,
      referenceId: customer.id,
    });
    if (!saved.ok) {
      return NextResponse.json(
        { error: `Your card could not be verified: ${saved.error} Please check the details or try another card.` },
        { status: 402 }
      );
    }

    const amount = Number(order.hold_amount) || 0;
    const orderRef = order.order_number || order.id.slice(0, 8);
    const hold = await createHold(squareConfig, {
      squareCustomerId: saved.card.squareCustomerId,
      cardId: saved.card.cardId,
      amount,
      orderNumber: orderRef,
      // A new key per card, so a second card after a decline gets its own hold
      idempotencyKey: `hld_${saved.card.cardId.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 45),
    });
    if (!hold.ok) {
      return NextResponse.json(
        { error: `This card couldn't be authorized for $${amount.toFixed(2)}: ${hold.error} Please try another card.` },
        { status: 402 }
      );
    }

    await supabase
      .from('orders')
      .update({
        square_customer_id: saved.card.squareCustomerId,
        square_card_id: saved.card.cardId,
        hold_payment_id: hold.paymentId,
        hold_expires_at: hold.expiresAt,
        hold_status: 'held',
        payment_status: 'authorized',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .eq('hold_status', 'declined');
    await supabase.from('order_payments').insert({
      order_id: order.id,
      square_payment_id: hold.paymentId,
      kind: 'hold',
      amount,
      status: 'approved',
      note: 'Hold placed on a new card from the tracking page',
    });
    await supabase.from('order_events').insert({
      order_id: order.id,
      status: 'booked',
      note: `New card added by the customer; hold of $${amount.toFixed(2)} placed.`,
      triggered_by: 'Customer (Tracking Page)',
    });
    if (!customer.square_customer_id) {
      await supabase.from('customers').update({ square_customer_id: saved.card.squareCustomerId }).eq('id', customer.id);
    }

    return NextResponse.json({ success: true, amount, message: "Card updated. You're all set for your pickup." });
  } catch (err: unknown) {
    return apiError('api/orders/[id]/hold-card', err, 500);
  }
}
