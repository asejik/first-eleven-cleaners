import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DRY_CLEAN_PRICES,
  WASH_FOLD_PRICE_PER_LB,
  WASH_FOLD_MINIMUM_LBS,
  WASH_FOLD_MINIMUM_PRICE,
  ZONE_CONFIG,
  SUPPORT_PHONE,
  SUPPORT_EMAIL,
  TX_SALES_TAX_RATE,
  ENVIRONMENTAL_FEE_RATE,
  FAILED_PICKUP_FEE,
  EXPRESS_MINIMUM_SURCHARGE,
} from '@/lib/constants';
import { buildLlmsTxt } from '@/lib/llms';
import { SITE_URL } from '@/lib/seo';

// ---------------------------------------------------------------------------
// P08 SEO-02: llms.txt is read by AI assistants, so its prices and zone facts
// must come from the same catalog the booking page charges from.
// ---------------------------------------------------------------------------
const text = buildLlmsTxt();
const money = (n: number) => `$${n.toFixed(2)}`;

describe('llms.txt matches the real catalog (P08 SEO-02)', () => {
  it('lists every dry cleaning item at its catalog price', () => {
    for (const { label, price } of Object.values(DRY_CLEAN_PRICES)) {
      expect(text).toContain(`${label}: ${money(price)}`);
    }
  });

  it('states the wash & fold price and minimum', () => {
    expect(text).toContain(`${money(WASH_FOLD_PRICE_PER_LB)} per pound`);
    expect(text).toContain(`${WASH_FOLD_MINIMUM_LBS} lb minimum (${money(WASH_FOLD_MINIMUM_PRICE)})`);
  });

  it('lists every zone with its minimum, route days and Express eligibility', () => {
    for (const zone of Object.values(ZONE_CONFIG)) {
      const line = text.split('\n').find((l) => l.startsWith(`- ${zone.name}:`));
      expect(line, zone.name).toBeDefined();
      expect(line).toContain(`${money(zone.minimumOrder)} minimum`);
      expect(line).toContain(zone.routeScheduleLabel);
      expect(line).toContain(zone.expressEligible ? 'Express eligible' : 'No Express');
      for (const city of zone.cities) expect(text).toContain(city);
    }
  });

  it('discloses the fees charged at checkout', () => {
    expect(text).toContain(`${(ENVIRONMENTAL_FEE_RATE * 100).toFixed(0)}% environmental fee`);
    expect(text).toContain(`${(TX_SALES_TAX_RATE * 100).toFixed(2)}% Texas sales tax`);
    expect(text).toContain(`${money(FAILED_PICKUP_FEE)} failed pickup or delivery fee`);
    expect(text).toContain(`${money(EXPRESS_MINIMUM_SURCHARGE)} minimum`);
    expect(text).not.toMatch(/zero surprise surcharges/i);
  });

  it('matches the Terms on the Make It Right guarantee', () => {
    expect(text).toContain('within 7 days of delivery');
    expect(text).not.toContain('within 24 hours or refund');
  });

  it('publishes no storefront address and uses the www site URL', () => {
    expect(text).not.toMatch(/Headquarters|streetAddress|75201/);
    expect(text).toContain('no storefront');
    expect(text).toContain(`${SITE_URL}/pricing`);
    expect(text).toContain(SUPPORT_PHONE);
    expect(text).toContain(SUPPORT_EMAIL);
    expect(text).not.toContain('https://firstelevencleaners.com');
  });

  it('is served by the route handler, not a hand-written static file', () => {
    const web = join(__dirname, '..');
    expect(existsSync(join(web, 'public', 'llms.txt'))).toBe(false);
    expect(existsSync(join(web, 'src', 'app', 'llms.txt', 'route.ts'))).toBe(true);
  });
});
