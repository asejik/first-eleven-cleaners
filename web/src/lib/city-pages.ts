import { DRY_CLEAN_PRICES } from '@/lib/constants';

/**
 * Service area pages (client 2026-10-20, #7), in the client's order: Zone 1 first, "where the
 * routes actually run"; Zones 2 to 4 come later. Each page's ZIPs are the Zone 1 ZIPs for that
 * place (constants.ts); the page checks them against the live coverage settings, so a ZIP moved
 * in Mission Control shows its real minimum or drops off the page. Only facts we can stand
 * behind: no landmarks, distances or street address (P08: pickup and delivery only).
 */
export interface CityPage {
  slug: string;
  /** Shown in the heading: "Dry Cleaning & Laundry Pickup in {name}" */
  name: string;
  /** The places on the page, in a sentence and in structured data */
  places: string[];
  zips: string[];
  /** Page title before " | First Eleven Cleaners" (60 characters in all) */
  title: string;
}

export const CITY_PAGES: CityPage[] = [
  {
    slug: 'north-dallas',
    name: 'North Dallas, Addison, Farmers Branch & Carrollton',
    places: ['North Dallas', 'Addison', 'Farmers Branch', 'Carrollton'],
    zips: ['75001', '75006', '75007', '75010', '75234', '75244', '75240', '75243', '75248', '75251', '75252', '75254', '75287'],
    title: 'Dry Cleaning Pickup in North Dallas',
  },
  { slug: 'plano', name: 'Plano', places: ['Plano'], zips: ['75023', '75024', '75025', '75074', '75075', '75093', '75094'], title: 'Dry Cleaning Pickup in Plano' },
  { slug: 'richardson', name: 'Richardson', places: ['Richardson'], zips: ['75080', '75081', '75082'], title: 'Dry Cleaning Pickup in Richardson' },
  { slug: 'frisco', name: 'Frisco', places: ['Frisco'], zips: ['75033', '75034', '75035', '75036'], title: 'Dry Cleaning Pickup in Frisco' },
  {
    slug: 'park-cities-preston-hollow',
    name: 'Park Cities & Preston Hollow',
    places: ['Highland Park', 'University Park', 'Preston Hollow'],
    zips: ['75205', '75209', '75225', '75220', '75229', '75230'],
    title: 'Dry Cleaning in the Park Cities',
  },
  { slug: 'lewisville', name: 'Lewisville', places: ['Lewisville'], zips: ['75057', '75067', '75077'], title: 'Dry Cleaning Pickup in Lewisville' },
  { slug: 'the-colony', name: 'The Colony', places: ['The Colony'], zips: ['75056'], title: 'Dry Cleaning Pickup in The Colony' },
  { slug: 'flower-mound', name: 'Flower Mound', places: ['Flower Mound'], zips: ['75022', '75028'], title: 'Dry Cleaning Pickup in Flower Mound' },
  { slug: 'coppell', name: 'Coppell', places: ['Coppell'], zips: ['75019'], title: 'Dry Cleaning Pickup in Coppell' },
];

export const cityPage = (slug: string) => CITY_PAGES.find((c) => c.slug === slug);
export const cityPagePath = (slug: string) => `/service-areas/${slug}`;

/** "A, B and C" */
export function placesText(places: string[]): string {
  return places.length < 2 ? places.join('') : `${places.slice(0, -1).join(', ')} and ${places[places.length - 1]}`;
}

/** The search result description, at most 160 characters (tests check every page) */
export function cityDescription(city: CityPage): string {
  return `Free dry cleaning and laundry pickup and delivery in ${placesText(city.places)}. Laundered shirts $${DRY_CLEAN_PRICES.laundered_shirt.price.toFixed(2)}, back in 2 business days.`;
}
