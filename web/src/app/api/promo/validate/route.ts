import { NextResponse } from 'next/server';
import { PROMO_CODE_LAUNCH, PROMO_DISCOUNT_PERCENT } from '@/lib/constants';

export async function POST(request: Request) {
  try {
    const { code } = await request.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ valid: false, message: 'Please provide a valid code.' }, { status: 400 });
    }

    const cleanCode = code.trim().toUpperCase();

    if (cleanCode === PROMO_CODE_LAUNCH) {
      return NextResponse.json({
        valid: true,
        code: cleanCode,
        discount_type: 'percentage',
        discount_value: PROMO_DISCOUNT_PERCENT,
        message: `${PROMO_DISCOUNT_PERCENT}% first-order discount applied!`,
      });
    }

    if (cleanCode === 'MATCHREADY') {
      return NextResponse.json({
        valid: true,
        code: cleanCode,
        discount_type: 'percentage',
        discount_value: 10,
        message: '10% match-ready discount applied!',
      });
    }

    return NextResponse.json({
      valid: false,
      message: 'Invalid or expired promo code.',
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
