import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAppBaseUrl } from '@/lib/constants';

/**
 * Validates the cryptographic Square HMAC-SHA256 signature using timing-safe comparison (SEC-007).
 */
function verifySquareSignature(
  url: string,
  rawBody: string,
  signature: string,
  signatureKey: string
): boolean {
  try {
    const hmac = crypto.createHmac('sha256', signatureKey);
    hmac.update(Buffer.from(url + rawBody, 'utf-8'));
    const computedSignature = hmac.digest('base64');

    const sigBuf = Buffer.from(signature, 'utf8');
    const compBuf = Buffer.from(computedSignature, 'utf8');
    if (sigBuf.length !== compBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, compBuf);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit(`square_webhook:${clientIp}`, 100, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: 'Too many webhook requests' }, { status: 429 });
    }

    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    const isProduction = process.env.NODE_ENV === 'production';
    const hasValidKey = Boolean(
      signatureKey &&
      !signatureKey.includes('placeholder') &&
      !signatureKey.includes('your-')
    );

    if (isProduction && !hasValidKey) {
      console.error('[Square Webhook] SQUARE_WEBHOOK_SIGNATURE_KEY is missing in production');
      return NextResponse.json(
        { error: 'Square webhook configuration error: signature key missing' },
        { status: 500 }
      );
    }

    const rawBody = await request.text();

    // Verify cryptographic HMAC-SHA256 signature when signature key is configured (SEC-007)
    if (hasValidKey && signatureKey) {
      const signature = request.headers.get('x-square-hmacsha256-signature');
      if (!signature) {
        return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 });
      }

      const candidateUrls = Array.from(new Set([
        request.url,
        `${getAppBaseUrl()}/api/payments/webhook`,
      ]));

      const isValid = candidateUrls.some((targetUrl) =>
        verifySquareSignature(targetUrl, rawBody, signature, signatureKey)
      );

      if (!isValid) {
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    } else if (!isProduction) {
      console.warn('[Square Webhook] Skipping signature verification in non-production (key not configured)');
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
        } else if (paymentId && paymentStatus === 'FAILED') {
          const { data: matchedOrder } = await supabase
            .from('orders')
            .select('id, payment_status, status')
            .eq('payment_id', paymentId)
            .maybeSingle();

          if (matchedOrder && matchedOrder.payment_status !== 'failed') {
            await supabase
              .from('orders')
              .update({
                payment_status: 'failed',
                updated_at: new Date().toISOString(),
              })
              .eq('id', matchedOrder.id);

            await supabase.from('order_events').insert({
              order_id: matchedOrder.id,
              status: matchedOrder.status,
              note: `Square Payment authorization failed (${paymentId}).`,
              triggered_by: 'Square Webhook Gateway',
            });
          }
        }
        break;
      }

      case 'refund.created':
      case 'refund.updated': {
        const refundObj = payload.data?.object?.refund;
        const paymentId = refundObj?.payment_id;
        const refundStatus = refundObj?.status;
        const refundId = refundObj?.id || '';
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

            // Deduplication: Check if this specific refund ID has already been logged (F007 Fix)
            const { data: existingEvent } = await supabase
              .from('order_events')
              .select('id')
              .eq('order_id', matchedOrder.id)
              .ilike('note', `%Square Refund ${refundId}%`)
              .maybeSingle();

            if (!existingEvent) {
              await supabase.from('order_events').insert({
                order_id: matchedOrder.id,
                status: matchedOrder.status,
                note: `Square Refund ${refundId} (${refundStatus || 'COMPLETED'})${refundAmount ? `: $${refundAmount.toFixed(2)} refunded` : ''}.`,
                triggered_by: 'Square Webhook Gateway',
              });
            }
          }
        }
        break;
      }

      case 'dispute.created':
      case 'dispute.updated':
      case 'dispute.closed': {
        const disputeObj = payload.data?.object?.dispute;
        const paymentId = disputeObj?.payment_id;
        const disputeState = disputeObj?.state || 'OPEN';
        const disputeId = disputeObj?.id || '';
        const disputeAmount = disputeObj?.amount_money?.amount
          ? Number(disputeObj.amount_money.amount) / 100
          : null;

        if (paymentId) {
          const { data: matchedOrder } = await supabase
            .from('orders')
            .select('id, order_number, status')
            .eq('payment_id', paymentId)
            .maybeSingle();

          if (matchedOrder) {
            const { data: existingDisputeEvent } = await supabase
              .from('order_events')
              .select('id')
              .eq('order_id', matchedOrder.id)
              .ilike('note', `%Square Dispute ${disputeId}%${disputeState}%`)
              .maybeSingle();

            if (!existingDisputeEvent) {
              await supabase.from('order_events').insert({
                order_id: matchedOrder.id,
                status: matchedOrder.status,
                note: `Square Dispute ${disputeId} (${disputeState})${disputeAmount ? `: $${disputeAmount.toFixed(2)} under review` : ''}.`,
                triggered_by: 'Square Dispute Gateway',
              });
            }
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
