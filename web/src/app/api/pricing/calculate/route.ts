import { NextResponse } from 'next/server';
import {
  DRY_CLEAN_PRICES,
  WASH_FOLD_PRICE_PER_LB,
  WASH_FOLD_MINIMUM_LBS,
  WASH_FOLD_MINIMUM_PRICE,
  EXPRESS_8HR_SURCHARGE,
  EXPRESS_4HR_SURCHARGE,
} from '@/lib/constants';
import type { PriceCalculation } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { dry_clean_items = [], weight_lbs = 0, express_tier = 'standard', promo_discount = 0 } = body;

    // Wash & Fold calculation with minimum enforcement
    let wash_fold_subtotal = 0;
    let meets_minimum = true;
    let minimum_shortfall = 0;

    if (weight_lbs > 0) {
      if (weight_lbs < WASH_FOLD_MINIMUM_LBS) {
        meets_minimum = false;
        wash_fold_subtotal = WASH_FOLD_MINIMUM_PRICE;
        minimum_shortfall = WASH_FOLD_MINIMUM_PRICE - (weight_lbs * WASH_FOLD_PRICE_PER_LB);
      } else {
        wash_fold_subtotal = weight_lbs * WASH_FOLD_PRICE_PER_LB;
      }
    }

    // Dry cleaning items calculation
    const calculatedItems: PriceCalculation['items'] = [];
    let dry_clean_subtotal = 0;

    for (const item of dry_clean_items) {
      const priceMeta = DRY_CLEAN_PRICES[item.garment_type];
      if (priceMeta && item.quantity > 0) {
        const itemTotal = priceMeta.price * item.quantity;
        dry_clean_subtotal += itemTotal;
        calculatedItems.push({
          label: priceMeta.label,
          quantity: item.quantity,
          unit_price: priceMeta.price,
          subtotal: itemTotal,
        });
      }
    }

    const subtotal = wash_fold_subtotal + dry_clean_subtotal;

    // Express Surcharge
    let express_surcharge = 0;
    if (express_tier === 'express_8hr') {
      express_surcharge = subtotal * EXPRESS_8HR_SURCHARGE;
    } else if (express_tier === 'express_4hr') {
      express_surcharge = subtotal * EXPRESS_4HR_SURCHARGE;
    }

    const rawTotal = subtotal + express_surcharge;
    const discount_amount = (rawTotal * (promo_discount || 0)) / 100;
    const total = Math.max(0, rawTotal - discount_amount);

    const result: PriceCalculation = {
      dry_clean_subtotal,
      wash_fold_subtotal,
      subtotal,
      express_surcharge,
      discount_amount,
      total,
      weight_lbs,
      meets_minimum,
      minimum_shortfall,
      items: calculatedItems,
    };

    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
