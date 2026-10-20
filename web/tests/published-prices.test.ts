import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ZONE_CONFIG, DRY_CLEAN_PRICES, WASH_FOLD_PRICE_PER_LB } from '@/lib/constants';
import { lowestMinimum, shirtPricesLine, washFoldLine } from '@/lib/published-prices';

// ---------------------------------------------------------------------------
// Client review 2026-10-20: #3 "Distinguish laundered shirts ($4.99) from dry-cleaned shirts
// ($8.99). There should be no contradiction between the homepage, pricing page, booking
// system, and final customer invoice." #4 "Wash & Fold from $3.00/lb. Minimum orders start at
// $45, depending on service area."
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Published prices come from the rate card', () => {
  it('shirts: dry-cleaned and laundered, as priced in the catalog', () => {
    expect(DRY_CLEAN_PRICES.shirt_blouse.price).toBe(8.99);
    expect(DRY_CLEAN_PRICES.laundered_shirt.price).toBe(4.99);
    expect(shirtPricesLine()).toBe('Shirts laundered $4.99 / dry-cleaned $8.99');
  });

  it('wash & fold: the client\'s sentence, with the lowest zone minimum', () => {
    expect(lowestMinimum(Object.values(ZONE_CONFIG))).toBe(45);
    expect(washFoldLine(45)).toBe('Wash & Fold from $3.00/lb. Minimum orders start at $45, depending on service area.');
  });

  it('the homepage uses them and no longer says "From $5.99" or a flat "$45 minimum"', () => {
    const home = read('src/app/page.tsx');
    expect(home).toContain('{shirtPricesLine()}');
    // Client 2026-10-20: shirts only, and a link to the full price list
    expect(home).toMatch(/<Link href=\{ROUTES\.pricing\} className=\{styles\.serviceLink\}>\s*See the full price list/);
    expect(home).toContain('{washFoldLine(minimumFrom)}');
    expect(home).not.toContain('From $5.99');
    expect(home).not.toContain('$45 min');
  });

  it('the pricing page description quotes the same prices', async () => {
    const { metadata } = await import('@/app/pricing/layout');
    const description = String(metadata.description);
    const minimum = lowestMinimum(Object.values(ZONE_CONFIG));
    expect(description).toContain(`Wash & fold $${WASH_FOLD_PRICE_PER_LB.toFixed(2)}/lb, minimums from $${minimum} by service area`);
    expect(description).toContain(`Dry-cleaned shirts $${DRY_CLEAN_PRICES.shirt_blouse.price}, laundered shirts $${DRY_CLEAN_PRICES.laundered_shirt.price}`);
    expect(description).not.toContain('$5.99');
  });
});
