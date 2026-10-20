import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ZONE_CONFIG } from '@/lib/constants';
import { resolveCoverage } from '@/lib/coverage';
import { CITY_PAGES, cityDescription, cityForZip, cityTurnaround, placesText } from '@/lib/city-pages';

// ---------------------------------------------------------------------------
// Client 2026-10-20 (#7): service area pages, in this order: North Dallas (Addison, Farmers
// Branch, Carrollton), Plano, Richardson, Frisco, Park Cities and Preston Hollow, then
// Lewisville, The Colony, Flower Mound and Coppell. Zone 1, where the routes run. "Zones 2 to 4
// after that."
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const zoneOf = (zips: string[]) => {
  const r = resolveCoverage({ zip: zips[0] });
  return r.status === 'served' ? r.zone : null;
};

describe('City pages', () => {
  it("Zone 1 in the client's order, then Zones 2, 3 and 4", () => {
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
      'uptown-downtown-dallas',
      'east-dallas-bishop-arts',
      'irving-las-colinas',
      'allen-mckinney-prosper',
      'grapevine-southlake-colleyville-euless',
      'bedford-hurst-keller-westlake',
      'arlington-grand-prairie',
      'denton',
      'rockwall-forney',
      'fort-worth',
      'mansfield',
    ]);
    expect(CITY_PAGES.map((c) => zoneOf(c.zips)?.id)).toEqual([
      ...Array(9).fill('zone_1'),
      ...Array(5).fill('zone_2'),
      ...Array(4).fill('zone_3'),
      ...Array(2).fill('zone_4'),
    ]);
    expect(CITY_PAGES[0].places).toEqual(['North Dallas', 'Addison', 'Farmers Branch', 'Carrollton']);
    expect(CITY_PAGES[4].places).toEqual(['Highland Park', 'University Park', 'Preston Hollow']);
  });

  it('each page is one zone, and together they cover every Zone 1-4 ZIP once', () => {
    for (const c of CITY_PAGES) {
      expect(new Set(c.zips.map((z) => zoneOf([z])?.id)).size, c.slug).toBe(1);
    }
    const zips = CITY_PAGES.flatMap((c) => c.zips);
    expect(new Set(zips).size).toBe(zips.length);
    const metro = Object.values(ZONE_CONFIG).flatMap((z) => z.zipCodes);
    expect([...zips].sort()).toEqual([...metro].sort());
  });

  it('titles fit search results (60 characters with the brand) and descriptions 160', () => {
    for (const c of CITY_PAGES) {
      expect(`${c.title} | First Eleven Cleaners`.length, c.title).toBeLessThanOrEqual(60);
      expect(cityDescription(c, zoneOf(c.zips)!.routeDays).length, c.slug).toBeLessThanOrEqual(160);
    }
    expect(cityDescription(CITY_PAGES[1], ZONE_CONFIG.zone_1.routeDays)).toBe(
      'Free dry cleaning and laundry pickup and delivery in Plano. Laundered shirts $4.99, back in 2 business days.',
    );
    expect(cityDescription(CITY_PAGES[16], ZONE_CONFIG.zone_3.routeDays)).toBe(
      'Free dry cleaning and laundry pickup and delivery in Denton on our Monday and Thursday routes. Laundered shirts $4.99.',
    );
  });

  it('Zones 3 and 4 come back on their route day, not "2 business days after pickup"', () => {
    expect(cityTurnaround(ZONE_CONFIG.zone_1.routeDays)).toBe('your order comes back 2 business days after pickup');
    expect(cityTurnaround(ZONE_CONFIG.zone_2.routeDays)).toBe('your order comes back 2 business days after pickup');
    expect(cityTurnaround(ZONE_CONFIG.zone_3.routeDays)).toBe(
      'your order is cleaned in 2 business days and comes back on the next Monday or Thursday route',
    );
    expect(cityTurnaround(ZONE_CONFIG.zone_4.routeDays)).toBe(
      'your order is cleaned in 2 business days and comes back on the next Tuesday or Friday route',
    );
  });

  it("booking's city guess: the ZIP's city when it has only one, never a zone's", () => {
    expect(cityForZip('75023')).toBe('Plano');
    expect(cityForZip('76063')).toBe('Mansfield');
    expect(cityForZip('76107')).toBe('Fort Worth');
    expect(cityForZip('76010')).toBeNull(); // Arlington & Grand Prairie (was "Fort Worth")
    expect(cityForZip('75201')).toBeNull(); // Uptown, Zone 2 (was "Plano")
    expect(cityForZip('75001')).toBeNull(); // Addison, North Dallas page
    expect(cityForZip('99999')).toBeNull();
    const step = read('src/components/booking/StepAddress.tsx');
    expect(step).toContain('cityForZip(val.trim())');
    expect(step).not.toContain("setCity('Fort Worth')");
  });

  it('places read as a sentence', () => {
    expect(placesText(['Plano'])).toBe('Plano');
    expect(placesText(['Highland Park', 'University Park', 'Preston Hollow'])).toBe('Highland Park, University Park and Preston Hollow');
  });

  it('the page reads live coverage, only claims what is true, and is linked from Service Areas', () => {
    const page = read('src/app/service-areas/[city]/page.tsx');
    expect(page).toContain('resolveCoverage({ zip }, coverage)');
    expect(page).toContain('dynamicParams = false');
    expect(page).toContain('cityTurnaround(zone.routeDays)');
    expect(page).toContain("zone.routeDays.includes('Saturday')");
    expect(page).toContain('photographed and tracked by order number');
    expect(page).not.toMatch(/barcod|18217|Midway|same-day|48 hours|back 2 business days after pickup/i);
    expect(read('src/app/service-areas/page.tsx')).toContain('href={cityPagePath(c.slug)}');
  });
});
