import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { order_id, amount, payment_id } = await request.json();

    if (!order_id || !amount) {
      return NextResponse.json(
        { error: 'Missing order_id or amount.' },
        { status: 400 }
      );
    }

    // Simulate Square Delayed Capture / Charge
    // In production with live SQUARE_ACCESS_TOKEN:
    // const { paymentsApi } = squareClient;
    // const { result } = await paymentsApi.completePayment(payment_id);

    const txnId = `sq_txn_${crypto.randomUUID().slice(0, 10)}`;

    return NextResponse.json({
      success: true,
      transaction_id: txnId,
      amount_charged: amount,
      payment_status: 'charged',
      message: `Card on file charged $${Number(amount).toFixed(2)} after photo intake verification.`,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
