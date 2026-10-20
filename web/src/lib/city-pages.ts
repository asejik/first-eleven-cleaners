import { ALL_ROUTE_DAYS, DRY_CLEAN_PRICES, type RouteDayName } from '@/lib/constants';

/**
 * Service area pages (client 2026-10-20, #7), in the client's order: Zone 1 first, "where the
 * routes actually run", then Zones 2 to 4, grouped like the zone ZIP lists in constants.ts.
 * Each page's ZIPs are its zone's ZIPs for that place; the page checks them against the live
 * coverage settings, so a ZIP moved
 * in Mission Control shows its real minimum or drops off the page. Only facts we can stand
 * behind: no landmarks, distances or street address (P08: pickup and delivery only).
 */
export interface CityPage {
  slug: string;
  /** Shown in the heading: "Dry Cleaning & Laundry Pickup in {name}" */
  name: string;
  /** The places on the page, in a sentence and in structured data */
  places: string[];
  /** Shorter places for the search description, when the full list is too long */
  summary?: string;
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
  // Zone 2
  {
    slug: 'uptown-downtown-dallas',
    name: 'Uptown, Downtown Dallas & Oak Lawn',
    places: ['Uptown', 'Victory Park', 'Downtown Dallas', 'Deep Ellum', 'Oak Lawn', 'Turtle Creek', 'the Design District'],
    summary: 'Uptown, Downtown Dallas and Oak Lawn',
    zips: ['75201', '75202', '75204', '75219', '75226', '75207', '75235', '75270'],
    title: 'Dry Cleaning Pickup in Uptown Dallas',
  },
  {
    slug: 'east-dallas-bishop-arts',
    name: 'Lakewood, East Dallas & Bishop Arts',
    places: ['Lakewood', 'East Dallas', 'Kessler Park', 'Bishop Arts'],
    zips: ['75206', '75214', '75218', '75223', '75208'],
    title: 'Dry Cleaning Pickup in East Dallas',
  },
  {
    slug: 'irving-las-colinas',
    name: 'Irving & Las Colinas',
    places: ['Irving', 'Las Colinas'],
    zips: ['75038', '75039', '75060', '75061', '75062', '75063'],
    title: 'Dry Cleaning in Irving & Las Colinas',
  },
  {
    slug: 'allen-mckinney-prosper',
    name: 'Allen, McKinney & Prosper',
    places: ['Allen', 'McKinney', 'Prosper'],
    zips: ['75002', '75013', '75069', '75070', '75071', '75072', '75078'],
    title: 'Dry Cleaning in Allen & McKinney',
  },
  {
    slug: 'grapevine-southlake-colleyville-euless',
    name: 'Grapevine, Southlake, Colleyville & Euless',
    places: ['Grapevine', 'Southlake', 'Colleyville', 'Euless'],
    zips: ['76051', '76092', '76034', '76039', '76040'],
    title: 'Dry Cleaning in Grapevine, Southlake',
  },
  // Zone 3
  {
    slug: 'bedford-hurst-keller-westlake',
    name: 'Bedford, Hurst, Keller & Westlake',
    places: ['Bedford', 'Hurst', 'Keller', 'Westlake'],
    zips: ['76021', '76022', '76053', '76054', '76244', '76248', '76262'],
    title: 'Dry Cleaning in Bedford & Keller',
  },
  {
    slug: 'arlington-grand-prairie',
    name: 'Arlington & Grand Prairie',
    places: ['Arlington', 'Grand Prairie'],
    zips: ['75050', '75051', '75052', '75054', '76006', '76010', '76011', '76012', '76013', '76014', '76015', '76016', '76017', '76018'],
    title: 'Dry Cleaning Pickup in Arlington',
  },
  {
    slug: 'denton',
    name: 'Denton',
    places: ['Denton'],
    zips: ['76201', '76202', '76203', '76204', '76205', '76207', '76208', '76209', '76210'],
    title: 'Dry Cleaning Pickup in Denton',
  },
  {
    slug: 'rockwall-forney',
    name: 'Rockwall, Heath & Forney',
    places: ['Rockwall', 'Heath', 'Forney'],
    zips: ['75032', '75087', '75126'],
    title: 'Dry Cleaning in Rockwall & Forney',
  },
  // Zone 4
  {
    slug: 'fort-worth',
    name: 'Fort Worth',
    places: ['Downtown Fort Worth', 'the Cultural District', 'central Fort Worth'],
    summary: 'Fort Worth',
    zips: ['76102', '76104', '76107', '76109', '76110', '76116'],
    title: 'Dry Cleaning Pickup in Fort Worth',
  },
  { slug: 'mansfield', name: 'Mansfield', places: ['Mansfield'], zips: ['76063'], title: 'Dry Cleaning Pickup in Mansfield' },
];

export const cityPage = (slug: string) => CITY_PAGES.find((c) => c.slug === slug);
export const cityPagePath = (slug: string) => `/service-areas/${slug}`;

/** "A, B and C" */
export function placesText(places: string[]): string {
  return places.length < 2 ? places.join('') : `${places.slice(0, -1).join(', ')} and ${places[places.length - 1]}`;
}

/** Daily routes (Zones 1-2) deliver when the plant is done; Zones 3-4 on their next route day */
const isDaily = (routeDays: readonly RouteDayName[]) => routeDays.length >= ALL_ROUTE_DAYS.length;

/** "Monday and Thursday" */
const daysText = (routeDays: readonly RouteDayName[]) => placesText(ALL_ROUTE_DAYS.filter((d) => routeDays.includes(d)));

/** The turnaround, as zoneDeliveryDate() works it out */
export function cityTurnaround(routeDays: readonly RouteDayName[]): string {
  return isDaily(routeDays)
    ? 'your order comes back 2 business days after pickup'
    : `your order is cleaned in 2 business days and comes back on the next ${daysText(routeDays).replace(/ and (?=\w+$)/, ' or ')} route`;
}

/** The search result description, at most 160 characters (tests check every page) */
export function cityDescription(city: CityPage, routeDays: readonly RouteDayName[]): string {
  const shirts = `Laundered shirts $${DRY_CLEAN_PRICES.laundered_shirt.price.toFixed(2)}`;
  return isDaily(routeDays)
    ? `Free dry cleaning and laundry pickup and delivery in ${city.summary ?? placesText(city.places)}. ${shirts}, back in 2 business days.`
    : `Free dry cleaning and laundry pickup and delivery in ${city.summary ?? placesText(city.places)} on our ${daysText(routeDays)} routes. ${shirts}.`;
}
