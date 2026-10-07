import { describe, it, expect } from 'vitest';
import {
  WASH_FOLD_PRICE_PER_LB,
  WASH_FOLD_MINIMUM_LBS,
  WASH_FOLD_MINIMUM_PRICE,
  DRY_CLEAN_PRICES,
  calculateExpressSurcharge,
  calculateOrderFinancials,
  resolveZoneByZip,
  ZONE_EXPRESS_ELIGIBLE,
  getZoneMinimumGap,
  ZONE_CONFIG,
  computeBookingFinancials,
} from '@/lib/constants';

function calculatePrice({
  dry_clean_items = [],
  weight_lbs = 0,
  express_tier = 'standard',
  promo_discount = 0,
  zip = '75205',
}: {
  dry_clean_items?: Array<{ garment_type: string; quantity: number }>;
  weight_lbs?: number;
  express_tier?: 'standard' | 'express_24hr';
  promo_discount?: number;
  zip?: string;
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
  const zone = resolveZoneByZip(zip);
  const zone_gap = getZoneMinimumGap(subtotal, zone);

  let express_surcharge = 0;
  // Surcharge math as it applies once the Express switch is on (it starts off, client 8E)
  if (express_tier === 'express_24hr' && zone && zone.id !== 'zone_5' && ZONE_EXPRESS_ELIGIBLE[zone.id]) {
    express_surcharge = calculateExpressSurcharge(subtotal, true);
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
    zone,
    zone_gap,
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
          { garment_type: 'shirt_blouse', quantity: 2 }, // 2 * 8.99 = 17.98
          { garment_type: 'pants_skirt', quantity: 1 },  // 1 * 8.99 = 8.99
        ],
      });
      expect(res.dry_clean_subtotal).toBeCloseTo(26.97, 2);
      expect(res.total).toBeCloseTo(26.97, 2);
    });

    it('combines wash & fold and dry clean in mixed orders', () => {
      const res = calculatePrice({
        weight_lbs: 20, // $60.00
        dry_clean_items: [{ garment_type: 'jacket', quantity: 1 }], // $22.99
      });
      expect(res.subtotal).toBeCloseTo(82.99, 2);
      expect(res.total).toBeCloseTo(82.99, 2);
    });
  });

  describe('24-Hour Express Pricing (+50%, no dollar floor)', () => {
    it('charges exactly 50% even on a small order (the $15 floor was removed 2026-10-06)', () => {
      const res = calculatePrice({
        dry_clean_items: [
          { garment_type: 'blouse', quantity: 1 }, // 8.99
          { garment_type: 'pants_skirt', quantity: 1 }, // 8.99 -> subtotal = 17.98
        ],
        express_tier: 'express_24hr',
        zip: '75205',
      });
      expect(res.subtotal).toBeCloseTo(17.98, 2);
      expect(res.express_surcharge).toBe(8.99);
      expect(res.total).toBeCloseTo(26.97, 2);
    });

    it('applies the full +50% surcharge on a larger order', () => {
      const res = calculatePrice({
        weight_lbs: 20, // $60.00
        express_tier: 'express_24hr',
        zip: '75205',
      });
      expect(res.subtotal).toBe(60.0);
      expect(res.express_surcharge).toBe(30.0); // 60 * 0.50 = 30
      expect(res.total).toBe(90.0);
    });
  });

  describe('Smart Coverage Zone Minimums', () => {
    it('resolves Zone 1 (Core) for Dallas ZIPs with $45 minimum and daily routes', () => {
      const zone = resolveZoneByZip('75205');
      expect(zone).not.toBeNull();
      expect(zone?.id).toBe('zone_1');
      expect(zone?.minimumOrder).toBe(45.0);
      // Express is switched off until the plant confirms (client 2026-10-07, 8E); Zone 1 may offer it
      expect(zone?.expressEligible).toBe(false);
      expect(ZONE_EXPRESS_ELIGIBLE.zone_1).toBe(true);
      expect(zone?.routeDays.length).toBe(6);
    });

    it('resolves Zone 2 (North Dallas Corridor) with $60 minimum and express eligibility', () => {
      const zone = resolveZoneByZip('75034'); // Frisco
      expect(zone).not.toBeNull();
      expect(zone?.id).toBe('zone_2');
      expect(zone?.minimumOrder).toBe(60.0);
      expect(zone?.expressEligible).toBe(false);
      expect(ZONE_EXPRESS_ELIGIBLE.zone_2).toBe(true);
    });

    it('resolves Zone 3 (Tarrant & West Metro) with $80 minimum, Mon/Thu routes, no Express', () => {
      const zone = resolveZoneByZip('76107'); // Fort Worth
      expect(zone).not.toBeNull();
      expect(zone?.id).toBe('zone_3');
      expect(zone?.minimumOrder).toBe(80.0);
      expect(zone?.expressEligible).toBe(false);
      expect(zone?.routeDays).toEqual(['Monday', 'Thursday']);
    });

    it('resolves Zone 4 (Extended North Texas) with $100 minimum and Tue/Fri routes', () => {
      const zone = resolveZoneByZip('76201'); // Denton
      expect(zone).not.toBeNull();
      expect(zone?.id).toBe('zone_4');
      expect(zone?.minimumOrder).toBe(100.0);
      expect(zone?.expressEligible).toBe(false);
      expect(zone?.routeDays).toEqual(['Tuesday', 'Friday']);
    });

    it('returns null for empty, incomplete, or out-of-area ZIP codes', () => {
      expect(resolveZoneByZip('')).toBeNull();
      expect(resolveZoneByZip('   ')).toBeNull();
      expect(resolveZoneByZip('752')).toBeNull();
      expect(resolveZoneByZip('24021')).toBeNull(); // Out of state (VA)
      expect(resolveZoneByZip('90210')).toBeNull(); // Out of state (CA)
      expect(resolveZoneByZip('10001')).toBeNull(); // Out of state (NY)
      expect(resolveZoneByZip('77001')).toBeNull(); // Houston, TX (outside North Texas)
      expect(resolveZoneByZip('78701')).toBeNull(); // Austin, TX (outside North Texas)
    });

    it('accurately calculates zone minimum gap shortfall without error', () => {
      const zone2 = ZONE_CONFIG.zone_2; // $60 min
      const gap35 = getZoneMinimumGap(35.0, zone2);
      expect(gap35).toBe(25.0);

      const gap65 = getZoneMinimumGap(65.0, zone2);
      expect(gap65).toBe(0);

      // Safe with null zone
      expect(getZoneMinimumGap(35.0, null)).toBe(0);
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

  describe('Server-Side Booking Financials Recalculation (F006 / F010)', () => {
    it('accurately computes subtotal from wash & fold and dry clean catalog items', () => {
      // 20 lbs wash & fold = $60.00 ($3.00/lb)
      // 2 jackets ($22.99 ea) = $45.98
      // 3 shirts ($8.99 ea) = $26.97
      // Total subtotal = $132.95
      const result = computeBookingFinancials({
        weightLbs: 20,
        dryCleanItems: [
          { garment_type: 'jacket', quantity: 2 },
          { garment_type: 'shirt_blouse', quantity: 3 },
        ],
      });

      expect(result.washFoldSubtotal).toBe(60.00);
      expect(result.dryCleanSubtotal).toBe(72.95);
      expect(result.subtotal).toBe(132.95);
      expect(result.financials.subtotal).toBe(132.95);
      expect(result.itemizedList).toHaveLength(3);
      expect(result.itemizedList[0].unit_price).toBe(3.00);
      expect(result.itemizedList[1].unit_price).toBe(22.99);
      expect(result.itemizedList[2].unit_price).toBe(8.99);
    });

    it('enforces Wash & Fold $45.00 minimum price for weight below 15 lbs', () => {
      const result = computeBookingFinancials({
        weightLbs: 8,
      });

      expect(result.washFoldSubtotal).toBe(45.00);
      expect(result.subtotal).toBe(45.00);
    });

    it('correctly applies 24-Hour Express surcharge (+50%, no floor) server-side', () => {
      // Subtotal $15.99 -> 50% is $7.995, rounds half-up to $8.00
      const smallOrder = computeBookingFinancials({
        dryCleanItems: [{ garment_type: 'dress', quantity: 1 }], // $15.99
        isExpress: true,
      });
      expect(smallOrder.subtotal).toBe(15.99);
      expect(smallOrder.financials.expressSurcharge).toBe(8.00);

      // Subtotal $154.99 -> 50% is $77.495, rounds to $77.50
      const largeOrder = computeBookingFinancials({
        weightLbs: 40, // 40 * $3.00 = $120.00
        dryCleanItems: [{ garment_type: 'overcoat', quantity: 1 }], // $34.99
        isExpress: true,
      });
      expect(largeOrder.subtotal).toBe(154.99);
      expect(largeOrder.financials.expressSurcharge).toBe(77.50);
    });

    it('correctly applies promo discount to subtotal and express surcharge', () => {
      const discounted = computeBookingFinancials({
        weightLbs: 20, // $60.00
        isExpress: true, // +$30.00 express = $90.00 gross
        promoDiscountPercent: 15, // 15% of $90.00 = $13.50
      });

      expect(discounted.subtotal).toBe(60.00);
      expect(discounted.financials.expressSurcharge).toBe(30.00);
      expect(discounted.financials.discountAmount).toBe(13.50);
    });
  });

  describe('Recurring Plan Frequency Discounts (F005)', () => {
    it('applies 10% discount on subtotal for weekly recurring plan', () => {
      const financials = calculateOrderFinancials({
        subtotal: 100.0,
        frequency: 'weekly',
      });
      expect(financials.frequencyDiscountPercent).toBe(10);
      expect(financials.frequencyDiscount).toBe(10.0);
      expect(financials.discountAmount).toBe(10.0);
      expect(financials.netSubtotal).toBe(90.0);
    });

    it('applies 5% discount on subtotal for bi-weekly recurring plan', () => {
      const financials = calculateOrderFinancials({
        subtotal: 100.0,
        frequency: 'biweekly',
      });
      expect(financials.frequencyDiscountPercent).toBe(5);
      expect(financials.frequencyDiscount).toBe(5.0);
      expect(financials.discountAmount).toBe(5.0);
      expect(financials.netSubtotal).toBe(95.0);
    });

    it('stacks recurring frequency discount with promotional discount', () => {
      // Subtotal $100.00
      // Weekly = 10% ($10.00)
      // Promo = 15% ($15.00)
      // Total discount = $25.00
      const financials = calculateOrderFinancials({
        subtotal: 100.0,
        frequency: 'weekly',
        discountPercent: 15,
      });
      expect(financials.frequencyDiscount).toBe(10.0);
      expect(financials.promoDiscount).toBe(15.0);
      expect(financials.discountAmount).toBe(25.0);
      expect(financials.netSubtotal).toBe(75.0);
    });

    it('honors frequency discount in computeBookingFinancials', () => {
      const result = computeBookingFinancials({
        weightLbs: 20, // $60.00
        frequency: 'weekly', // 10% of $60.00 = $6.00
      });
      expect(result.subtotal).toBe(60.0);
      expect(result.financials.frequencyDiscount).toBe(6.0);
      expect(result.financials.discountAmount).toBe(6.0);
      expect(result.financials.netSubtotal).toBe(54.0);
    });
  });
});
