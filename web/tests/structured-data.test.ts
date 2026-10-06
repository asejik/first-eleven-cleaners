import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DRY_CLEAN_PRICES, WASH_FOLD_PRICE_PER_LB, SUPPORT_EMAIL } from '@/lib/constants';
import { buildSiteJsonLd, SITE_URL } from '@/lib/seo';

// ---------------------------------------------------------------------------
// P08 SEO-03: structured data may only state real, visible facts. The business
// is pickup and delivery only (no storefront) and its hours aren't confirmed.
// ---------------------------------------------------------------------------
type Business = {
  '@type': string;
  address: unknown;
  telephone: string;
  email: string;
  logo: string;
  hasOfferCatalog: { itemListElement: { price?: string; priceSpecification?: { minPrice: string } }[] };
};
const json = JSON.stringify(buildSiteJsonLd());
const business = (JSON.parse(json)['@graph'] as Business[]).find((n) => n['@type'] === 'DryCleaningOrLaundryService')!;

describe('Structured data states only confirmed facts (P08 SEO-03)', () => {
  it('has no street address, coordinates, postal code or opening hours', () => {
    expect(json).not.toMatch(/streetAddress|postalCode|GeoCoordinates|openingHours|Downtown Dallas/);
    expect(business.address).toEqual({
      '@type': 'PostalAddress',
      addressLocality: 'Dallas',
      addressRegion: 'TX',
      addressCountry: 'US',
    });
  });

  it('takes prices and contact details from the catalog', () => {
    const offers = business.hasOfferCatalog.itemListElement;
    expect(offers[0].price).toBe(WASH_FOLD_PRICE_PER_LB.toFixed(2));
    const lowest = Math.min(...Object.values(DRY_CLEAN_PRICES).map((p) => p.price));
    expect(offers[1].priceSpecification?.minPrice).toBe(lowest.toFixed(2));
    expect(offers[1].price).toBeUndefined();
    expect(business.telephone).toBe('+1-682-200-0039');
    expect(business.email).toBe(SUPPORT_EMAIL);
  });

  it('names the logo and uses the www site URL throughout', () => {
    expect(business.logo).toBe(`${SITE_URL}/logo.png`);
    expect(json).not.toContain('https://firstelevencleaners.com');
  });

  it('the root layout renders the shared builder', () => {
    const layout = readFileSync(join(__dirname, '..', 'src', 'app', 'layout.tsx'), 'utf8');
    expect(layout).toContain('buildSiteJsonLd()');
    expect(layout).not.toContain('openingHoursSpecification');
  });
});
