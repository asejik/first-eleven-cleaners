import {
  APP_NAME,
  APP_TAGLINE,
  DRY_CLEAN_PRICES,
  WASH_FOLD_PRICE_PER_LB,
  WASH_FOLD_MINIMUM_LBS,
  WASH_FOLD_MINIMUM_PRICE,
  EXPRESS_SURCHARGE_PERCENT,
  EXPRESS_MINIMUM_SURCHARGE,
  ENVIRONMENTAL_FEE_RATE,
  TX_SALES_TAX_RATE,
  FAILED_PICKUP_FEE,
  PICKUP_WINDOWS,
  PROCESSING_HOURS,
  ZONE_CONFIG,
  SUPPORT_PHONE,
  SUPPORT_EMAIL,
} from '@/lib/constants';
import { SITE_URL } from '@/lib/seo';

const money = (n: number) => `$${n.toFixed(2)}`;
const percent = (rate: number, digits = 0) => `${(rate * 100).toFixed(digits)}%`;

/**
 * Plain-text summary for AI assistants, served at /llms.txt (P08 SEO-02).
 * Prices, fees and zones come from constants.ts so this can't drift from what
 * the booking page charges. The About facts were confirmed by the owner (P05).
 */
export function buildLlmsTxt(): string {
  const zones = Object.values(ZONE_CONFIG);
  const expressZones = zones.filter((z) => z.expressEligible).map((z) => z.name).join(' and ');
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
    '',
    '### Dry Cleaning (per item)',
    ...Object.values(DRY_CLEAN_PRICES).map(({ label, price }) => `- ${label}: ${money(price)}`),
    '',
    '### 24-Hour Express ("Match-Ready Tomorrow")',
    `- Picked up in the morning window (${morning.start}-${morning.end}) and delivered the next morning by ${morning.end}.`,
    '- Monday-Friday pickups only, limited daily slots. Book by 9 PM for next-morning pickup, or by 7 AM for same-day morning pickup.',
    `- Surcharge: +${percent(EXPRESS_SURCHARGE_PERCENT)} of the order subtotal, ${money(EXPRESS_MINIMUM_SURCHARGE)} minimum.`,
    `- Available in ${expressZones} only. Leather, suede, formal wear and other specialty items are excluded.`,
    `- If an Express delivery misses the ${morning.end} window, the Express surcharge is refunded.`,
    '',
    '### Fees shown at checkout',
    '- Pickup and delivery: free in every zone (each zone has an order minimum instead).',
    `- ${percent(ENVIRONMENTAL_FEE_RATE)} environmental fee.`,
    `- ${percent(TX_SALES_TAX_RATE, 2)} Texas sales tax.`,
    `- ${money(FAILED_PICKUP_FEE)} failed pickup or delivery fee may apply if the driver can't complete a pickup or delivery in the confirmed window (first occurrence waived).`,
    '',
    '### Commercial',
    `- Laundry and dry cleaning programs for businesses. Request a rate card: ${SITE_URL}/commercial`,
    '',
    '## Service Area',
    `Standard turnaround: ${PROCESSING_HOURS} hours. Pickup windows: ${windows}. Details: ${SITE_URL}/service-areas`,
    '',
    ...zones.map(
      (z) =>
        `- ${z.name}: ${money(z.minimumOrder)} minimum, ${z.routeScheduleLabel}, ${z.expressEligible ? 'Express eligible' : 'No Express'}. Areas: ${z.cities.join(', ')}.`,
    ),
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
