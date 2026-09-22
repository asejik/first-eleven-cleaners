import { NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = await checkRateLimitAsync(`payment_charge:${clientIp}`, 10, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for card charges. Please wait a minute.' },
        { status: 429 }
      );
    }

    const auth = await verifyApiAuth(['admin', 'intake_staff'], request);
    if (auth.errorResponse) return auth.errorResponse;

    const { order_id, amount, source_id } = await request.json();

    if (!order_id || !amount || Number(amount) <= 0) {
      return NextResponse.json(
        { error: 'Valid order_id and amount are required.' },
        { status: 400 }
      );
    }

    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    const isLiveSquare = Boolean(accessToken && !accessToken.includes('placeholder') && accessToken.startsWith('EAAA'));

    if (isLiveSquare) {
      const squareBaseUrl = process.env.SQUARE_ENVIRONMENT === 'sandbox'
        ? 'https://connect.squareupsandbox.com/v2'
        : 'https://connect.squareup.com/v2';

      try {
        const squareRes = await fetch(`${squareBaseUrl}/payments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Square-Version': '2025-01-23',
          },
          body: JSON.stringify({
            idempotency_key: `f11_charge_${order_id}`,
            source_id: source_id || 'cnon:card-nonce-ok',
            amount_money: {
              amount: Math.round(Number(amount) * 100),
              currency: 'USD',
            },
            autocomplete: true,
            note: `First Eleven Cleaners - Order #${order_id}`,
          }),
        });

        const squareData = await squareRes.json();
        if (!squareRes.ok) {
          const errorDetail = squareData.errors?.[0]?.detail || 'Square payment charge authorization failed.';
          return NextResponse.json({ error: errorDetail }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          transaction_id: squareData.payment.id,
          amount_charged: amount,
          payment_status: squareData.payment.status,
          receipt_url: squareData.payment.receipt_url || null,
          message: `Card on file charged $${Number(amount).toFixed(2)} via Square.`,
        });
      } catch (squareErr) {
        console.error('Square API charge call failed:', squareErr);
        return NextResponse.json(
          { error: 'Payment gateway communication failed while charging card on file.' },
          { status: 502 }
        );
      }
    }

    if (process.env.NODE_ENV === 'production' || isLiveSquare) {
      return NextResponse.json(
        { error: 'Live payment capture failed. Simulated charges are forbidden in production.' },
        { status: 400 }
      );
    }

    // Default simulation fallback for testing / development
    const txnId = `sq_txn_${crypto.randomUUID().slice(0, 10)}`;

    return NextResponse.json({
      success: true,
      transaction_id: txnId,
      amount_charged: amount,
      payment_status: 'charged',
      message: `[DEV SIMULATION] Card charged $${Number(amount).toFixed(2)} in local environment.`,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
