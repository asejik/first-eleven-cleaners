import { describe, it, expect } from 'vitest';
import {
  calculateExpressSurcharge,
  calculateOrderFinancials,
  computeBookingFinancials,
  DRY_CLEAN_PRICES,
} from '@/lib/constants';
import { expressRefundAmount } from '@/lib/express';

// ---------------------------------------------------------------------------
// PR-27: money is computed in whole cents with half-cents rounded up, so totals
// don't depend on floating-point quirks.
// ---------------------------------------------------------------------------
const cents = (n: number) => Math.round(n * 100);
const isWholeCents = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

describe('Money in whole cents (PR-27)', () => {
  it('rounds half-cents up instead of following float error', () => {
    // 50% of $179.85 is $89.925: half a cent rounds up to $89.93
    expect(calculateExpressSurcharge(179.85, true)).toBe(89.93);
    expect(calculateOrderFinancials({ subtotal: 179.85, isExpress: true }).finalTotal).toBe(300.79);
  });

  it('every amount is whole cents and the total is exactly the sum of its parts', () => {
    const keys = Object.keys(DRY_CLEAN_PRICES);
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 5000; i++) {
      const items = keys.filter(() => rnd() < 0.35).map((k) => ({ garment_type: k, quantity: 1 + Math.floor(rnd() * 6) }));
      const { financials: f } = computeBookingFinancials({
        dryCleanItems: items,
        weightLbs: rnd() < 0.5 ? 0 : Math.round(rnd() * 120) / 2,
        isExpress: rnd() < 0.3,
        promoDiscountPercent: [0, 10, 15][Math.floor(rnd() * 3)],
        frequency: (['one_time', 'weekly', 'biweekly'] as const)[Math.floor(rnd() * 3)],
      });
      for (const v of [f.subtotal, f.expressSurcharge, f.discountAmount, f.netSubtotal, f.environmentalFee, f.salesTax, f.finalTotal]) {
        expect(isWholeCents(v)).toBe(true);
      }
      expect(cents(f.finalTotal)).toBe(cents(f.netSubtotal) + cents(f.environmentalFee) + cents(f.salesTax));
      expect(cents(f.environmentalFee)).toBe(Math.round((cents(f.netSubtotal) * 3) / 100));
      expect(cents(f.salesTax)).toBe(Math.round(((cents(f.netSubtotal) + cents(f.environmentalFee)) * 825) / 10000));
    }
  });

  it('Express refunds use the same cents rules', () => {
    // $20 surcharge + $0.60 fee + 8.25% of $20.60 ($1.6995 -> $1.70) = $22.30
    expect(expressRefundAmount(20)).toBe(22.3);
    // $89.93 + $2.70 (2.6979) + 8.25% of $92.63 ($7.6420 -> $7.64) = $100.27
    expect(expressRefundAmount(89.93)).toBe(100.27);
  });

  it('a fixed promo larger than the order never makes the total negative', () => {
    expect(calculateOrderFinancials({ subtotal: 3, discountAmount: 5 }).finalTotal).toBe(0);
  });
});
