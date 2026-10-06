import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DRY_CLEAN_PRICES,
  catalogItems,
  catalogLineTotal,
  catalogSubtotal,
  catalogPriceLabel,
  computeBookingFinancials,
  isExpressExcluded,
  resolveZoneByZip,
  getZoneMinimumGap,
} from '@/lib/constants';

// ---------------------------------------------------------------------------
// Client price card of 2026-10-06: updated dry cleaning prices, a new Household
// category, napkin dozen pricing, every price ending in .99, no leather/suede on
// any menu, and household / specialty items excluded from Express.
// ---------------------------------------------------------------------------
const SRC = join(__dirname, '..', 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

const EXPECTED: Record<string, number> = {
  shirt_blouse: 8.99,
  blouse: 8.99,
  pants_skirt: 8.99,
  jeans: 10.99,
  laundered_shirt: 4.99,
  laundered_shirt_boxed: 9.99,
  dress: 15.99,
  formal_dress: 27.99,
  evening_gown: 44.99,
  wedding_dress: 149.99,
  sweater: 10.99,
  sweater_heavy: 13.99,
  jacket: 22.99,
  overcoat: 34.99,
  traditional_shirt: 19.99,
  jersey: 9.99,
  hat: 8.99,
  tie_scarf: 7.99,
  jumpsuit: 17.99,
  apron: 5.99,
  press_only: 5.99,
  comforter_queen: 39.99,
  comforter_king: 45.99,
  comforter_down: 49.99,
  blanket: 19.99,
  pillowcase: 5.99,
  tablecloth_small: 24.99,
  tablecloth_large: 39.99,
  napkin: 5.99,
  drapes_short: 29.99,
  drapes_long: 49.99,
};

describe('Price card 2026-10', () => {
  it('has exactly the agreed items and prices', () => {
    const actual = Object.fromEntries(Object.entries(DRY_CLEAN_PRICES).map(([k, v]) => [k, v.price]));
    expect(actual).toEqual(EXPECTED);
  });

  it('every price ends in .99', () => {
    for (const item of Object.values(DRY_CLEAN_PRICES)) {
      expect(Math.round(item.price * 100) % 100, item.label).toBe(99);
      if (item.dozenPrice) expect(Math.round(item.dozenPrice * 100) % 100, item.label).toBe(99);
    }
  });

  it('household items are their own category', () => {
    expect(catalogItems('household').map(([k]) => k)).toEqual([
      'comforter_queen', 'comforter_king', 'comforter_down', 'blanket', 'pillowcase',
      'tablecloth_small', 'tablecloth_large', 'napkin', 'drapes_short', 'drapes_long',
    ]);
  });

  it('leather and suede are on no menu', () => {
    for (const [key, item] of Object.entries(DRY_CLEAN_PRICES)) {
      expect(`${key} ${item.label}`).not.toMatch(/leather|suede/i);
    }
  });

  it('"from" items show their starting price', () => {
    expect(catalogPriceLabel(DRY_CLEAN_PRICES.evening_gown)).toBe('from $44.99');
    expect(catalogPriceLabel(DRY_CLEAN_PRICES.wedding_dress)).toBe('from $149.99');
    expect(catalogPriceLabel(DRY_CLEAN_PRICES.drapes_long)).toBe('from $49.99');
    expect(catalogPriceLabel(DRY_CLEAN_PRICES.jacket)).toBe('$22.99');
  });
});

describe('Napkin dozen pricing', () => {
  it.each([
    [1, 5.99],
    [10, 59.9],
    [11, 64.99], // never more than a dozen
    [12, 64.99],
    [13, 70.98],
    [24, 129.98],
    [25, 135.97],
  ])('%i napkins cost $%d', (qty, total) => {
    expect(catalogLineTotal('napkin', qty)).toBe(total);
  });

  it('the server charges the dozen price', () => {
    const result = computeBookingFinancials({ dryCleanItems: [{ garment_type: 'napkin', quantity: 12 }] });
    expect(result.subtotal).toBe(64.99);
    expect(result.itemizedList[0].subtotal).toBe(64.99);
  });

  it('other items are priced per piece', () => {
    expect(catalogLineTotal('shirt_blouse', 12)).toBe(107.88);
    expect(catalogLineTotal('unknown', 3)).toBe(0);
  });
});

describe("Client's validation examples", () => {
  it('3 shirts + 1 formal dress = $54.96 subtotal, tax and fee on top', () => {
    const result = computeBookingFinancials({
      dryCleanItems: [
        { garment_type: 'shirt_blouse', quantity: 3 },
        { garment_type: 'formal_dress', quantity: 1 },
      ],
    });
    expect(result.subtotal).toBe(54.96);
    expect(result.financials.environmentalFee).toBe(1.65);
    expect(result.financials.finalTotal).toBeGreaterThan(54.96);
  });

  it('a king comforter alone clears the Zone 1 minimum', () => {
    const subtotal = catalogSubtotal({ comforter_king: 1 });
    expect(subtotal).toBe(45.99);
    expect(getZoneMinimumGap(subtotal, resolveZoneByZip('75205'))).toBe(0);
  });
});

describe('Express exclusions', () => {
  it('excludes household items, evening gowns and wedding dresses', () => {
    for (const [key] of catalogItems('household')) expect(isExpressExcluded(key), key).toBe(true);
    expect(isExpressExcluded('evening_gown')).toBe(true);
    expect(isExpressExcluded('wedding_dress')).toBe(true);
    expect(isExpressExcluded('formal_dress')).toBe(true);
    expect(isExpressExcluded('leather')).toBe(true);
    expect(isExpressExcluded('shirt_blouse')).toBe(false);
    expect(isExpressExcluded('jacket')).toBe(false);
  });

  it('the booking API and booking screen use the shared rule', () => {
    expect(read('app/api/bookings/route.ts')).toContain('isExpressExcluded(item.garment_type)');
    expect(read('hooks/useBookingState.ts')).toContain('isExpressExcluded(key)');
  });
});

describe('Every screen uses the shared line rule (dozen pricing)', () => {
  it.each([
    'app/pricing/page.tsx',
    'hooks/useBookingState.ts',
    'components/booking/StepReview.tsx',
    'components/mission-control/IntakeTicketWorkspace.tsx',
    'app/api/intake/route.ts',
    'app/api/pricing/calculate/route.ts',
  ])('%s', (file) => {
    expect(read(file)).toMatch(/catalog(LineTotal|Subtotal)\(/);
    expect(read(file)).not.toMatch(/\.price \* qty|qty \* item\.price|priceMeta\.price \* item\.quantity/);
  });

  it('the pricing page and booking step list the household category', () => {
    expect(read('app/pricing/page.tsx')).toContain("renderMenu('household')");
    expect(read('components/booking/StepGarments.tsx')).toContain("renderGrid('household')");
  });

  it('booking add-on buttons only add real catalog items', () => {
    const src = read('components/booking/StepGarments.tsx');
    const keys = [...src.matchAll(/updateDryCleanQty\('([a-z_]+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(DRY_CLEAN_PRICES[key], key).toBeDefined();
  });
});
