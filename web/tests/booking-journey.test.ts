import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  resolveZoneByZip,
  getZoneMinimumGap,
  calculateOrderFinancials,
  computeBookingFinancials,
  DRY_CLEAN_PRICES,
  WASH_FOLD_PRICE_PER_LB,
  WASH_FOLD_MINIMUM_PRICE,
  WASH_FOLD_MINIMUM_LBS,
  EXPRESS_EXCLUDED_GARMENTS,
  PROMO_CODE_LAUNCH,
  PROMO_DISCOUNT_PERCENT,
} from '@/lib/constants';

const BookingSchema = z.object({
  customer: z.object({
    full_name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(7),
  }),
  address: z.object({
    street: z.string().min(3),
    unit: z.string().optional(),
    city: z.string().default('Dallas'),
    state: z.string().default('TX'),
    zip: z.string().min(5),
    delivery_notes: z.string().optional(),
  }),
  services: z.object({
    type: z.enum(['dry_clean', 'wash_fold', 'mixed']),
    dry_clean_items: z
      .array(
        z.object({
          garment_type: z.string(),
          quantity: z.number().int().positive(),
        })
      )
      .optional()
      .default([]),
    estimated_weight_lbs: z.number().nonnegative().optional().default(0),
  }),
  schedule: z.object({
    pickup_date: z.string(),
    pickup_window: z.enum(['morning', 'evening']),
    express_tier: z.enum(['standard', 'express_24hr']).default('standard'),
    frequency: z.enum(['one_time', 'weekly', 'biweekly']).optional().default('one_time'),
  }),
  pricing: z
    .object({
      subtotal: z.number().default(0),
      discount_amount: z.number().default(0),
      total: z.number().default(0),
      promo_code: z.string().optional().nullable(),
    })
    .default({ subtotal: 0, discount_amount: 0, total: 0 }),
  payment_method: z
    .object({
      card_brand: z.string().default('visa'),
      last_4: z.string().default('4242'),
      payment_token: z.string().optional().nullable(),
    })
    .optional(),
});

describe('Booking Journey E2E Integration Tests', () => {
  describe('Step 1: Address, Zone Resolution, and City Mapping', () => {
    it('correctly maps Zone 1 (Dallas Core) with $45 minimum and Express eligibility', () => {
      const zone = resolveZoneByZip('75201');
      expect(zone).not.toBeNull();
      expect(zone?.id).toBe('zone_1');
      expect(zone?.minimumOrder).toBe(45);
      expect(zone?.expressEligible).toBe(true);
    });

    it('correctly maps Zone 2 (North Dallas / Plano) with $60 minimum and Express eligibility', () => {
      const zone = resolveZoneByZip('75024');
      expect(zone).not.toBeNull();
      expect(zone?.id).toBe('zone_2');
      expect(zone?.minimumOrder).toBe(60);
      expect(zone?.expressEligible).toBe(true);
    });

    it('correctly maps Zone 3 (Fort Worth Metro) with $80 minimum and scheduled routes (Express unavailable)', () => {
      const zone = resolveZoneByZip('76102');
      expect(zone).not.toBeNull();
      expect(zone?.id).toBe('zone_3');
      expect(zone?.minimumOrder).toBe(80);
      expect(zone?.expressEligible).toBe(false);
      expect(zone?.routeScheduleLabel).toContain('Tue & Fri');
    });

    it('correctly maps Zone 4 (Outer DFW / Denton) with $100 minimum and gates Express', () => {
      const zone = resolveZoneByZip('76201');
      expect(zone).not.toBeNull();
      expect(zone?.id).toBe('zone_4');
      expect(zone?.minimumOrder).toBe(100);
      expect(zone?.expressEligible).toBe(false);
    });

    it('rejects unserviced non-DFW ZIP codes', () => {
      const zone = resolveZoneByZip('77001'); // Houston
      expect(zone).toBeNull();
    });
  });

  describe('Step 2: Service Selection and Garment Pricing', () => {
    it('calculates mixed laundry and dry cleaning order correctly', () => {
      const weightLbs = 20;
      const washFoldSubtotal = weightLbs * WASH_FOLD_PRICE_PER_LB; // 20 * $3 = $60
      const dryCleanItems = [
        { garment_type: 'jacket', quantity: 2 }, // 2 * $14.97 = $29.94
        { garment_type: 'laundered_shirt', quantity: 4 }, // 4 * $4.47 = $17.88
      ];

      const dryCleanSubtotal = dryCleanItems.reduce((sum, item) => {
        return sum + DRY_CLEAN_PRICES[item.garment_type].price * item.quantity;
      }, 0);

      const totalSubtotal = Number((washFoldSubtotal + dryCleanSubtotal).toFixed(2));
      expect(washFoldSubtotal).toBe(60);
      expect(Number(dryCleanSubtotal.toFixed(2))).toBe(47.82);
      expect(totalSubtotal).toBe(107.82);
    });

    it('enforces 15 lb minimum price on small wash & fold loads', () => {
      const weightLbs = 8;
      const effectivePrice = weightLbs < WASH_FOLD_MINIMUM_LBS
        ? WASH_FOLD_MINIMUM_PRICE
        : weightLbs * WASH_FOLD_PRICE_PER_LB;

      expect(effectivePrice).toBe(45);
    });
  });

  describe('Step 3: Schedule, Turnaround, and Express Surcharge', () => {
    it('applies 50% Express surcharge with $15 minimum floor', () => {
      const smallSubtotal = 20;
      const smallSurcharge = calculateOrderFinancials({
        subtotal: smallSubtotal,
        isExpress: true,
      }).expressSurcharge;
      expect(smallSurcharge).toBe(15); // Hit $15 floor (50% of $20 = $10 < $15)

      const largeSubtotal = 100;
      const largeSurcharge = calculateOrderFinancials({
        subtotal: largeSubtotal,
        isExpress: true,
      }).expressSurcharge;
      expect(largeSurcharge).toBe(50); // 50% of $100 = $50
    });

    it('disqualifies orders containing excluded delicate/leather garments from Express', () => {
      const orderItems = {
        jacket: 1,
        formal_dress: 1,
      };

      const hasExcluded = Object.keys(orderItems).some(
        (key) => (EXPRESS_EXCLUDED_GARMENTS as readonly string[]).includes(key)
      );

      expect(hasExcluded).toBe(true);
    });
  });

  describe('Step 4: Recurring Frequency & Promotional Discounts', () => {
    it('applies 10% discount for weekly recurring schedule', () => {
      const financials = calculateOrderFinancials({
        subtotal: 100,
        frequency: 'weekly',
      });
      expect(financials.frequencyDiscount).toBe(10);
      expect(financials.discountAmount).toBe(10);
    });

    it('applies 5% discount for bi-weekly recurring schedule', () => {
      const financials = calculateOrderFinancials({
        subtotal: 100,
        frequency: 'biweekly',
      });
      expect(financials.frequencyDiscount).toBe(5);
      expect(financials.discountAmount).toBe(5);
    });

    it('stacks frequency discount with KICKOFF15 promotional launch code', () => {
      const financials = calculateOrderFinancials({
        subtotal: 100,
        frequency: 'weekly',
        discountPercent: PROMO_DISCOUNT_PERCENT,
      });

      expect(financials.frequencyDiscount).toBe(10);
      expect(financials.promoDiscount).toBe(15);
      expect(financials.discountAmount).toBe(25);
    });
  });

  describe('Step 5: Zone Minimum Protection', () => {
    it('blocks checkout when order subtotal is below zone minimum', () => {
      const zone3 = resolveZoneByZip('76102'); // Fort Worth ($80 min)
      const lowSubtotal = 50;
      const gap = getZoneMinimumGap(lowSubtotal, zone3);
      expect(gap).toBe(30);
    });

    it('permits checkout when order meets or exceeds zone minimum', () => {
      const zone3 = resolveZoneByZip('76102');
      const qualifiedSubtotal = 95;
      const gap = getZoneMinimumGap(qualifiedSubtotal, zone3);
      expect(gap).toBe(0);
    });
  });

  describe('Step 6: Authoritative Server Calculation & Payload Validation', () => {
    it('recomputes financials server-side and produces valid Zod booking payload', () => {
      const recomputed = computeBookingFinancials({
        dryCleanItems: [{ garment_type: 'jacket', quantity: 2 }],
        weightLbs: 20,
        isExpress: true,
        frequency: 'weekly',
        promoDiscountPercent: PROMO_DISCOUNT_PERCENT,
      });

      // 20 lbs * $3 = $60 + 2 jackets * $14.97 = $29.94 -> subtotal = $89.94
      expect(recomputed.subtotal).toBe(89.94);
      // Express 50% on 89.94 = $44.97
      expect(recomputed.financials.expressSurcharge).toBe(44.97);
      // 10% frequency discount on 89.94 = $8.99
      expect(recomputed.financials.frequencyDiscount).toBe(8.99);
      expect(recomputed.financials.finalTotal).toBeGreaterThan(0);

      const validPayload = {
        customer: {
          full_name: 'Jordan Alvarez',
          email: 'jordan@dfwcommercial.com',
          phone: '(214) 555-0812',
        },
        address: {
          street: '500 Main Street',
          unit: 'Suite 1400',
          city: 'Fort Worth',
          state: 'TX',
          zip: '76102',
          delivery_notes: 'Leave with front security desk.',
        },
        services: {
          type: 'mixed' as const,
          dry_clean_items: [{ garment_type: 'jacket', quantity: 2 }],
          estimated_weight_lbs: 20,
        },
        schedule: {
          pickup_date: '2026-09-16',
          pickup_window: 'morning' as const,
          express_tier: 'express_24hr' as const,
          frequency: 'weekly' as const,
        },
        pricing: {
          subtotal: recomputed.subtotal,
          discount_amount: recomputed.financials.discountAmount,
          total: recomputed.financials.finalTotal,
          promo_code: PROMO_CODE_LAUNCH,
        },
        payment_method: {
          card_brand: 'visa',
          last_4: '4242',
          payment_token: 'cnon:mock-verified-token',
        },
      };

      const parsed = BookingSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.address.city).toBe('Fort Worth');
        expect(parsed.data.schedule.express_tier).toBe('express_24hr');
        expect(parsed.data.schedule.frequency).toBe('weekly');
      }
    });
  });
});
