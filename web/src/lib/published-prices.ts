import { DRY_CLEAN_PRICES, ENVIRONMENTAL_FEE_RATE, TX_SALES_TAX_RATE, WASH_FOLD_PRICE_PER_LB } from '@/lib/constants';

/**
 * Prices quoted in marketing copy, read from the rate card so the homepage, pricing page,
 * booking and the final invoice can't disagree (client review 2026-10-20, #3 and #4).
 */
const money = (n: number) => `$${n.toFixed(2)}`;

export const DRY_CLEANED_SHIRT_PRICE = DRY_CLEAN_PRICES.shirt_blouse.price;
export const LAUNDERED_SHIRT_PRICE = DRY_CLEAN_PRICES.laundered_shirt.price;

/** "Dry-cleaned shirts $8.99 · Laundered shirts $4.99" */
export function shirtPricesLine(): string {
  return `Dry-cleaned shirts ${money(DRY_CLEANED_SHIRT_PRICE)} · Laundered shirts ${money(LAUNDERED_SHIRT_PRICE)}`;
}

/** The lowest order minimum across the Metroplex zones (Zone 1 today). */
export function lowestMinimum(zones: ReadonlyArray<{ minimumOrder: number }>): number {
  return Math.min(...zones.map((z) => z.minimumOrder));
}

/** "Wash & Fold from $3.00/lb. Minimum orders start at $45, depending on service area." */
export function washFoldLine(minimumFrom: number): string {
  return `Wash & Fold from ${money(WASH_FOLD_PRICE_PER_LB)}/lb. Minimum orders start at $${minimumFrom.toFixed(0)}, depending on service area.`;
}

/**
 * Express status while Mission Control's switch is off (client 2026-10-07, 8E), worded the same
 * on every page (client review 2026-10-20, #5).
 */
export const EXPRESS_COMING_SOON_BADGE = 'Coming Soon';
export const EXPRESS_COMING_SOON =
  '24-Hour Express is coming soon. It opens once our plant confirms next-day capacity; until then every order gets our standard turnaround.';

/**
 * The two charges added to every order, named the same on every screen and receipt (client
 * review 2026-10-20, #6). The environmental fee is First Eleven's own charge, not a government
 * tax; Texas sales tax is charged on the service price including that fee.
 */
const pct = (rate: number) => `${Number((rate * 100).toFixed(2))}%`;
export const ENV_FEE_LABEL = `Environmental Service Fee (${pct(ENVIRONMENTAL_FEE_RATE)})`;
export const SALES_TAX_LABEL = `Texas Sales Tax (${pct(TX_SALES_TAX_RATE)})`;
export const ENV_FEE_NOTE =
  'The Environmental Service Fee is a First Eleven Cleaners charge, not a government tax. It supports solvent recycling, water reclamation, and sustainable packaging.';
