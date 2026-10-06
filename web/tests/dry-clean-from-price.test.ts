import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DRY_CLEAN_PRICES } from '@/lib/constants';
import { buildSiteJsonLd, dryCleanFromPrice } from '@/lib/seo';

// ---------------------------------------------------------------------------
// P08 SEO-13: the published "dry cleaning from" price is the cheapest
// dry-cleaned item (the laundered shirt isn't dry cleaned). The JSON-LD said
// $4.99 and the site said $8.99; the real figure is Tie / Scarf at $7.99.
// Price card of 2026-10-06: the cheapest is now Apron / Press Only at $5.99,
// and household items don't count.
// ---------------------------------------------------------------------------
const APP = join(__dirname, '..', 'src', 'app');
const from = `$${dryCleanFromPrice().toFixed(2)}`;

describe('Dry cleaning "from" price matches the price list (P08 SEO-13)', () => {
  it('is the cheapest dry-cleaned item, excluding laundered shirts and household items', () => {
    const dryCleaned = Object.entries(DRY_CLEAN_PRICES).filter(
      ([key, item]) => item.category === 'dry_clean' && !key.startsWith('laundered_shirt'),
    );
    expect(dryCleanFromPrice()).toBe(Math.min(...dryCleaned.map(([, item]) => item.price)));
    expect(dryCleanFromPrice()).toBe(5.99);
  });

  it('structured data uses it', () => {
    const json = JSON.stringify(buildSiteJsonLd());
    expect(json).toContain(`"minPrice":"${dryCleanFromPrice().toFixed(2)}"`);
  });

  it('the homepage and pricing description quote it', () => {
    expect(readFileSync(join(APP, 'page.tsx'), 'utf8')).toContain(
      `From ${from}/garment (shirts from $${DRY_CLEAN_PRICES.laundered_shirt.price.toFixed(2)})`,
    );
    expect(readFileSync(join(APP, 'pricing', 'layout.tsx'), 'utf8')).toContain(`dry cleaning from ${from}`);
  });
});
