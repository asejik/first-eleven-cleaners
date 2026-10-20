import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ZONE_CONFIG } from '@/lib/constants';
import { CITY_PAGES, cityDescription, placesText } from '@/lib/city-pages';

// ---------------------------------------------------------------------------
// Client 2026-10-20 (#7): service area pages, in this order: North Dallas (Addison, Farmers
// Branch, Carrollton), Plano, Richardson, Frisco, Park Cities and Preston Hollow, then
// Lewisville, The Colony, Flower Mound and Coppell. Zone 1, where the routes run.
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('City pages', () => {
  it("are in the client's order", () => {
    expect(CITY_PAGES.map((c) => c.slug)).toEqual([
      'north-dallas',
      'plano',
      'richardson',
      'frisco',
      'park-cities-preston-hollow',
      'lewisville',
      'the-colony',
      'flower-mound',
      'coppell',
    ]);
    expect(CITY_PAGES[0].places).toEqual(['North Dallas', 'Addison', 'Farmers Branch', 'Carrollton']);
    expect(CITY_PAGES[4].places).toEqual(['Highland Park', 'University Park', 'Preston Hollow']);
  });

  it('cover exactly the Zone 1 ZIPs, each once', () => {
    const zips = CITY_PAGES.flatMap((c) => c.zips);
    expect(new Set(zips).size).toBe(zips.length);
    expect([...zips].sort()).toEqual([...ZONE_CONFIG.zone_1.zipCodes].sort());
  });

  it('titles fit search results (60 characters with the brand) and descriptions 160', () => {
    for (const c of CITY_PAGES) {
      expect(`${c.title} | First Eleven Cleaners`.length, c.title).toBeLessThanOrEqual(60);
      expect(cityDescription(c).length, c.slug).toBeLessThanOrEqual(160);
    }
    expect(cityDescription(CITY_PAGES[1])).toBe(
      'Free dry cleaning and laundry pickup and delivery in Plano. Laundered shirts $4.99, back in 2 business days.',
    );
  });

  it('places read as a sentence', () => {
    expect(placesText(['Plano'])).toBe('Plano');
    expect(placesText(['Highland Park', 'University Park', 'Preston Hollow'])).toBe('Highland Park, University Park and Preston Hollow');
  });

  it('the page reads live coverage, only claims what is true, and is linked from Service Areas', () => {
    const page = read('src/app/service-areas/[city]/page.tsx');
    expect(page).toContain('resolveCoverage({ zip }, coverage)');
    expect(page).toContain('dynamicParams = false');
    expect(page).toContain('photographed and tracked by order number');
    expect(page).not.toMatch(/barcod|18217|Midway|same-day|48 hours/i);
    expect(read('src/app/service-areas/page.tsx')).toContain('href={cityPagePath(c.slug)}');
  });
});
