import { describe, it, expect } from 'vitest';
import {
  WASH_FOLD_PRICE_PER_LB,
  WASH_FOLD_MINIMUM_LBS,
  WASH_FOLD_MINIMUM_PRICE,
  DRY_CLEAN_PRICES,
  EXPRESS_8HR_SURCHARGE,
  EXPRESS_4HR_SURCHARGE,
} from '@/lib/constants';

function calculatePrice({
  dry_clean_items = [],
  weight_lbs = 0,
  express_tier = 'standard',
  promo_discount = 0,
}: {
  dry_clean_items?: Array<{ garment_type: string; quantity: number }>;
  weight_lbs?: number;
  express_tier?: 'standard' | 'express_8hr' | 'express_4hr';
  promo_discount?: number;
}) {
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

  let dry_clean_subtotal = 0;
  for (const item of dry_clean_items) {
    const priceMeta = DRY_CLEAN_PRICES[item.garment_type];
    if (priceMeta && item.quantity > 0) {
      dry_clean_subtotal += priceMeta.price * item.quantity;
    }
  }

  const subtotal = wash_fold_subtotal + dry_clean_subtotal;

  let express_surcharge = 0;
  if (express_tier === 'express_8hr') {
    express_surcharge = subtotal * EXPRESS_8HR_SURCHARGE;
  } else if (express_tier === 'express_4hr') {
    express_surcharge = subtotal * EXPRESS_4HR_SURCHARGE;
  }

  const rawTotal = subtotal + express_surcharge;
  const discount_amount = (rawTotal * (promo_discount || 0)) / 100;
  const total = Math.max(0, rawTotal - discount_amount);

  return {
    wash_fold_subtotal,
    dry_clean_subtotal,
    subtotal,
    express_surcharge,
    discount_amount,
    total,
    meets_minimum,
    minimum_shortfall,
  };
}

describe('Pricing Engine & Business Rules', () => {
  describe('Wash & Fold Minimums ($45 / 15 lbs floor)', () => {
    it('enforces $45 minimum for loads below 15 lbs', () => {
      const res = calculatePrice({ weight_lbs: 10 });
      expect(res.meets_minimum).toBe(false);
      expect(res.wash_fold_subtotal).toBe(45.0);
      expect(res.minimum_shortfall).toBe(15.0); // 45 - (10 * 3) = 15
      expect(res.total).toBe(45.0);
    });

    it('charges exact price when weight meets or exceeds 15 lbs', () => {
      const res15 = calculatePrice({ weight_lbs: 15 });
      expect(res15.meets_minimum).toBe(true);
      expect(res15.wash_fold_subtotal).toBe(45.0);
      expect(res15.minimum_shortfall).toBe(0);

      const res20 = calculatePrice({ weight_lbs: 20 });
      expect(res20.meets_minimum).toBe(true);
      expect(res20.wash_fold_subtotal).toBe(60.0);
      expect(res20.total).toBe(60.0);
    });
  });

  describe('Dry Cleaning Menu Itemization', () => {
    it('calculates exact item totals according to menu constants', () => {
      const res = calculatePrice({
        dry_clean_items: [
          { garment_type: 'shirt_blouse', quantity: 2 }, // 2 * 8.97 = 17.94
          { garment_type: 'pants_skirt', quantity: 1 },  // 1 * 8.97 = 8.97
        ],
      });
      expect(res.dry_clean_subtotal).toBeCloseTo(26.91, 2);
      expect(res.total).toBeCloseTo(26.91, 2);
    });

    it('combines wash & fold and dry clean in mixed orders', () => {
      const res = calculatePrice({
        weight_lbs: 20, // $60.00
        dry_clean_items: [{ garment_type: 'jacket', quantity: 1 }], // $14.97
      });
      expect(res.subtotal).toBeCloseTo(74.97, 2);
      expect(res.total).toBeCloseTo(74.97, 2);
    });
  });

  describe('Turnaround Speed Surcharges', () => {
    it('applies +25% surcharge for express_8hr rush tier', () => {
      const res = calculatePrice({
        weight_lbs: 20, // $60.00
        express_tier: 'express_8hr',
      });
      expect(res.subtotal).toBe(60.0);
      expect(res.express_surcharge).toBe(15.0); // 60 * 0.25 = 15
      expect(res.total).toBe(75.0);
    });

    it('applies +40% surcharge for express_4hr rush tier', () => {
      const res = calculatePrice({
        weight_lbs: 20, // $60.00
        express_tier: 'express_4hr',
      });
      expect(res.subtotal).toBe(60.0);
      expect(res.express_surcharge).toBe(24.0); // 60 * 0.40 = 24
      expect(res.total).toBe(84.0);
    });
  });

  describe('Promotional Discounts', () => {
    it('applies percentage discount properly', () => {
      const res = calculatePrice({
        weight_lbs: 20, // $60.00
        promo_discount: 15, // 15% off = $9.00 discount
      });
      expect(res.subtotal).toBe(60.0);
      expect(res.discount_amount).toBe(9.0);
      expect(res.total).toBe(51.0);
    });
  });
});
