import {
  APP_NAME,
  APP_TAGLINE,
  catalogItems,
  catalogPriceLabel,
  type CatalogItem,
  WASH_FOLD_PRICE_PER_LB,
  WASH_FOLD_MINIMUM_LBS,
  WASH_FOLD_MINIMUM_PRICE,
  EXPRESS_SURCHARGE_PERCENT,
  ENVIRONMENTAL_FEE_RATE,
  TX_SALES_TAX_RATE,
  FAILED_PICKUP_FEE,
  PICKUP_WINDOWS,
  PROCESSING_HOURS,
  EXTENDED_REACH_LABEL,
  extendedReachTurnaroundLine,
  SUPPORT_PHONE,
  SUPPORT_EMAIL,
} from '@/lib/constants';
import { SITE_URL } from '@/lib/seo';
import { ALTERATIONS_NOT_OFFERED } from '@/lib/alterations';
import { routinePricingLine, lateCancelLine } from '@/lib/ai/price-list';
import { DEFAULT_COVERAGE, feeLabel, extendedReachStartLine, type Coverage } from '@/lib/coverage';

const money = (n: number) => `$${n.toFixed(2)}`;
const catalogLine = (item: CatalogItem) =>
  `- ${item.label}: ${catalogPriceLabel(item)}${item.note ? ` (${item.note})` : ''}`;
const percent = (rate: number, digits = 0) => `${(rate * 100).toFixed(digits)}%`;

/**
 * Plain-text summary for AI assistants, served at /llms.txt (P08 SEO-02).
 * Prices, fees and zones come from constants.ts so this can't drift from what
 * the booking page charges. The About facts were confirmed by the owner (P05).
 */
export function buildLlmsTxt(coverage: Coverage = DEFAULT_COVERAGE): string {
  const zones = coverage.zonesList;
  const reach = coverage.extendedReach;
  const reachZone = coverage.extendedReachZone;
  const windows = PICKUP_WINDOWS.map((w) => `${w.label} ${w.start}-${w.end}`).join(', ');
  const morning = PICKUP_WINDOWS.find((w) => w.id === 'morning')!;

  return [
    `# ${APP_NAME}`,
    '',
    `> ${APP_TAGLINE}`,
    '> Dry cleaning and wash & fold laundry with free pickup and delivery across the Dallas-Fort Worth Metroplex, Texas.',
    '',
    '## About',
    `${APP_NAME} was born at the FIFA World Cup 2026 International Broadcast Centre (IBC) in Dallas, Texas, providing 12 weeks of high-pressure garment operations for 3,500 accredited international media professionals with a signed Vendor Performance Confirmation. ${APP_NAME} is a certified Minority Business Enterprise (MBE), Service-Disabled Veteran-Owned Small Business (SDVOSB), Texas Veteran-HUB, and Disadvantaged Business Enterprise (DBE).`,
    `${APP_NAME} is a pickup and delivery service with no storefront. Customers book online and a driver collects and returns their garments.`,
    '',
    '## Services and Prices',
    `Full price list: ${SITE_URL}/pricing`,
    '',
    '### Wash & Fold',
    `- ${money(WASH_FOLD_PRICE_PER_LB)} per pound, ${WASH_FOLD_MINIMUM_LBS} lb minimum (${money(WASH_FOLD_MINIMUM_PRICE)}).`,
    '- Washed, dried, sorted, folded and packaged.',
    `- ${routinePricingLine()}`,
    '',
    '### Dry Cleaning (per item)',
    ...catalogItems('dry_clean').map(([, item]) => catalogLine(item)),
    '',
    '### Household (per item)',
    ...catalogItems('household').map(([, item]) => catalogLine(item)),
    '',
    '### Alterations (per item)',
    ...catalogItems('alteration').map(([, item]) => catalogLine(item)),
    '- Turnaround 3-5 business days; the whole order returns together. Not available with 24-Hour Express.',
    '- Each piece needs a fit instruction at booking: a measurement, a garment to match (tagged MATCH), pins, an amount, or a description. "From" prices are confirmed after intake photos.',
    `- ${ALTERATIONS_NOT_OFFERED}`,
    '',
    '### 24-Hour Express ("Match-Ready Tomorrow")',
    `- Picked up in the morning window (${morning.start}-${morning.end}) and delivered the next morning by ${morning.end}.`,
    ...(coverage.expressEnabled ? [] : ['- Coming soon: not bookable yet.']),
    '- Monday-Thursday pickups only (the plant is closed on weekends), limited daily slots. Book by 9 PM for next-morning pickup, or by 7 AM for same-day morning pickup.',
    `- Surcharge: +${percent(EXPRESS_SURCHARGE_PERCENT)} of the order subtotal (no separate dollar minimum; the zone order minimum applies).`,
    '- Zones 1 and 2 only. Formal wear, evening gowns, wedding dresses, household items and other specialty items are excluded.',
    `- If an Express delivery misses the ${morning.end} window, the Express surcharge is refunded.`,
    '',
    '### Fees shown at checkout',
    '- Pickup and delivery: free across the DFW Metroplex, Zones 1-4 (each zone has an order minimum instead).',
    `- ${EXTENDED_REACH_LABEL} (Zone 5, beyond the Metroplex): ${reach.bands.map((b) => `${feeLabel(b.fee)} at ${b.minMiles}-${b.maxMiles} miles`).join(', ')} by driving distance, ${reach.routineDiscountPercent}% off for Routine members (Weekly or Bi-Weekly plan). Taxed like any line.`,
    `- ${percent(ENVIRONMENTAL_FEE_RATE)} environmental fee.`,
    `- ${percent(TX_SALES_TAX_RATE, 2)} Texas sales tax.`,
    `- ${money(FAILED_PICKUP_FEE)} failed pickup or delivery fee may apply if the driver can't complete a pickup or delivery in the confirmed window (first occurrence waived).`,
    `- ${lateCancelLine()}`,
    '',
    '### Commercial',
    `- Laundry and dry cleaning programs for businesses. Request a rate card: ${SITE_URL}/commercial`,
    '',
    '## Service Area',
    `Standard turnaround: ${PROCESSING_HOURS} hours, counted on plant days (the plant runs Monday to Friday): Thursday pickups are delivered Monday, Friday and Saturday pickups Tuesday. Pickup windows: ${windows}. Details: ${SITE_URL}/service-areas`,
    '',
    ...zones.map(
      (z) =>
        `- ${z.name}: ${money(z.minimumOrder)} minimum, ${z.routeScheduleLabel}, ${z.expressEligible ? 'Express eligible' : 'No Express'}. Areas: ${z.cities.join(', ')}.`,
    ),
    `- ${reachZone.name}: ${money(reach.minimumOrder)} minimum plus the ${EXTENDED_REACH_LABEL} fee, weekly ${reach.routeDay} runs: ${extendedReachTurnaroundLine(reach)} New pickups open on a run once ${reach.bands.map((b) => `${b.dispatchThreshold} (Band ${b.id})`).join(' or ')} neighbors book or a delivery is already due there. No Express. Areas: ${reachZone.cities.join(', ')}.${reach.firstRunDate ? '' : ` ${extendedReachStartLine(reach)}`}`,
    `- Zones 1-4 follow their area lists; an address not on a list is placed by driving distance from our plant (0-15 miles Zone 1, 15-25 Zone 2, 25-35 Zone 3, 35-45 Zone 4, 45-80 Zone 5). Zones 3 and 4 deliver on their next route day (a Zone 4 Friday pickup is delivered Tuesday). Beyond ${reach.waitlistBeyondMiles} miles: not served yet, join the waitlist at ${SITE_URL}/book.`,
    '',
    '## Make It Right Guarantee',
    `If you are not satisfied with the cleaning or pressing of a garment, tell us within 7 days of delivery and we re-clean it free. Terms: ${SITE_URL}/terms`,
    '',
    '## Contact',
    `- Website: ${SITE_URL}`,
    `- Book a pickup: ${SITE_URL}/book`,
    `- Phone: ${SUPPORT_PHONE}`,
    `- Email: ${SUPPORT_EMAIL}`,
    '',
  ].join('\n');
}
