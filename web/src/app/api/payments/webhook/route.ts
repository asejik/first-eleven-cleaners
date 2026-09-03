import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit(`square_webhook:${clientIp}`, 100, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: 'Too many webhook requests' }, { status: 429 });
    }

    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    const rawBody = await request.text();

    // Verify cryptographic HMAC-SHA256 signature when signature key is configured
    if (signatureKey) {
      const signature = request.headers.get('x-square-hmacsha256-signature');
      const webhookUrl = request.url;

      if (!signature) {
        return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 });
      }

      const hmac = crypto.createHmac('sha256', signatureKey);
      hmac.update(webhookUrl + rawBody);
      const computedSignature = hmac.digest('base64');

      if (signature !== computedSignature) {
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.type;

    const supabase = createAdminClient();

    // Handle Square Webhook Events
    switch (eventType) {
      case 'payment.created':
      case 'payment.updated': {
        const paymentObj = payload.data?.object?.payment;
        const paymentId = paymentObj?.id;
        const paymentStatus = paymentObj?.status;

        if (paymentId && paymentStatus === 'COMPLETED') {
          const { data: matchedOrder } = await supabase
            .from('orders')
            .select('id, payment_status')
            .eq('payment_id', paymentId)
            .maybeSingle();

          if (matchedOrder && matchedOrder.payment_status !== 'charged') {
            await supabase
              .from('orders')
              .update({
                payment_status: 'charged',
                updated_at: new Date().toISOString(),
              })
              .eq('id', matchedOrder.id);
          }
        }
        break;
      }

      case 'refund.created':
      case 'refund.updated': {
        const refundObj = payload.data?.object?.refund;
        const paymentId = refundObj?.payment_id;
        const refundStatus = refundObj?.status;
        const refundAmount = refundObj?.amount_money?.amount
          ? Number(refundObj.amount_money.amount) / 100
          : null;

        if (paymentId) {
          const { data: matchedOrder } = await supabase
            .from('orders')
            .select('id, order_number, status, payment_status')
            .eq('payment_id', paymentId)
            .maybeSingle();

          if (matchedOrder) {
            // Update order payment status to refunded if completed or in-progress
            if (refundStatus === 'COMPLETED' || !refundStatus) {
              await supabase
                .from('orders')
                .update({
                  payment_status: 'refunded',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', matchedOrder.id);
            }

            // Insert audit record in order_events
            await supabase.from('order_events').insert({
              order_id: matchedOrder.id,
              status: matchedOrder.status,
              note: `Square Refund ${refundObj?.id || ''} (${refundStatus || 'COMPLETED'})${refundAmount ? `: $${refundAmount.toFixed(2)} refunded` : ''}.`,
              triggered_by: 'Square Webhook Gateway',
            });
          }
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
