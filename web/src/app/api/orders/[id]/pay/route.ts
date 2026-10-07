import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { getSquareConfig, saveCardOnFile } from '@/lib/square';
import { chargeHeldOrder } from '@/lib/payment-recovery';
import { apiError } from '@/lib/api-errors';

/**
 * Pay an order marked Payment Needed with a new card (P03 PR-04).
 *
 * Reached from the tracking link, which carries the unguessable order UUID (the same
 * access the public tracking page has). The amount is what the order still owes (its total,
 * or the rest after intake captured the card hold);
 * nothing about the amount comes from the browser. Rate-limited per network and per order
 * so the endpoint can't be used to test stolen cards.
 */
const PaySchema = z.object({
  card_token: z.string().min(8, 'Please enter your card details.').max(500),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ONE_HOUR = 60 * 60 * 1000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const clientIp = getClientIp(request);
    const [ipCheck, orderCheck] = await Promise.all([
      checkRateLimitAsync(`order_pay_ip:${clientIp}`, 10, ONE_HOUR),
      checkRateLimitAsync(`order_pay_order:${id}`, 5, ONE_HOUR),
    ]);
    if (!ipCheck.allowed || !orderCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many payment attempts. Please wait an hour or call us to pay by phone.' },
        { status: 429 }
      );
    }

    const parsed = PaySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Please enter your card details.' }, { status: 400 });
    }
    const cardToken = parsed.data.card_token;

    const supabase = createAdminClient();
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, total, amount_due, payment_id, payment_status, customer_id, square_customer_id, square_card_id')
      .eq('id', id)
      .maybeSingle();
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    if (order.payment_status !== 'failed') {
      return NextResponse.json({ error: 'This order has no payment due.' }, { status: 409 });
    }

    const squareConfig = getSquareConfig();
    let card: { squareCustomerId: string; cardId: string } | undefined;

    if (squareConfig.isLive) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id, full_name, email, square_customer_id')
        .eq('id', order.customer_id)
        .maybeSingle();
      if (!customer) {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
      }

      const saved = await saveCardOnFile(squareConfig, {
        cardToken,
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
      card = { squareCustomerId: saved.card.squareCustomerId, cardId: saved.card.cardId };

      if (!customer.square_customer_id) {
        await supabase.from('customers').update({ square_customer_id: card.squareCustomerId }).eq('id', customer.id);
      }
    }

    const result = await chargeHeldOrder(supabase, order, {
      card,
      keyPrefix: 'pay',
      actorLabel: 'Customer (Tracking Page Payment)',
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      amount: result.amount,
      message: 'Payment received. Thank you! Your order is back on schedule.',
    });
  } catch (err: unknown) {
    return apiError('api/orders/[id]/pay', err, 500);
  }
}
