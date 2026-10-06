import {
  DRY_CLEAN_PRICES,
  WASH_FOLD_PRICE_PER_LB,
  WASH_FOLD_MINIMUM_LBS,
  WASH_FOLD_MINIMUM_PRICE,
  ENVIRONMENTAL_FEE_RATE,
  TX_SALES_TAX_RATE,
  EXPRESS_SURCHARGE_PERCENT,
  ZONE_CONFIG,
} from '@/lib/constants';

/**
 * Price text for the Eleven concierge, generated from the booking catalog (P03 PR-21) so the
 * assistant can never quote a price the booking page doesn't charge.
 */
const money = (n: number) => `$${n.toFixed(2)}`;
const pct = (rate: number) => `${Number((rate * 100).toFixed(2))}%`;

/** A two-piece suit is billed as a jacket plus pants. */
export const SUIT_PRICE = Number((DRY_CLEAN_PRICES.jacket.price + DRY_CLEAN_PRICES.pants_skirt.price).toFixed(2));
/** Business dress shirts are laundered and pressed. */
export const DRESS_SHIRT_PRICE = DRY_CLEAN_PRICES.laundered_shirt.price;

export function washFoldLine(lang: 'en' | 'es' = 'en'): string {
  return lang === 'es'
    ? `${money(WASH_FOLD_PRICE_PER_LB)} por libra (mínimo de ${WASH_FOLD_MINIMUM_LBS} lbs / ${money(WASH_FOLD_MINIMUM_PRICE)})`
    : `${money(WASH_FOLD_PRICE_PER_LB)} per lb (${WASH_FOLD_MINIMUM_LBS}-lb minimum / ${money(WASH_FOLD_MINIMUM_PRICE)})`;
}

/** "Label: $price" for every dry-cleaning catalog item. */
export function dryCleanLines(): string[] {
  return Object.values(DRY_CLEAN_PRICES).map(({ label, price }) => `${label}: ${money(price)}`);
}

export function feesLine(lang: 'en' | 'es' = 'en'): string {
  return lang === 'es'
    ? `Se agregan un cargo ambiental de ${pct(ENVIRONMENTAL_FEE_RATE)} y el impuesto de Texas de ${pct(TX_SALES_TAX_RATE)}. Recogida y entrega gratis.`
    : `A ${pct(ENVIRONMENTAL_FEE_RATE)} environmental fee and ${pct(TX_SALES_TAX_RATE)} Texas sales tax are added at checkout. Pickup and delivery are free.`;
}

export function zoneMinimumLines(): string[] {
  return Object.values(ZONE_CONFIG).map(
    (z) => `${z.name}: ${money(z.minimumOrder)} order minimum, ${z.routeScheduleLabel}${z.expressEligible ? ', 24-Hour Express available' : ''}`
  );
}

export function expressLine(): string {
  return `24-Hour Express: +${pct(EXPRESS_SURCHARGE_PERCENT)} of the order subtotal (the zone order minimum still applies), Monday-Thursday morning pickups in eligible zones.`;
}

/** Bullet list for chat replies. */
export function chatPriceList(lang: 'en' | 'es' = 'en'): string {
  const washLabel = lang === 'es' ? 'Lavandería Wash & Fold' : 'Wash & Fold Laundry';
  const bullets = [`• **${washLabel}:** ${washFoldLine(lang)}`, ...dryCleanLines().map((l) => `• ${l}`)];
  return `${bullets.join('\n')}\n\n${feesLine(lang)}`;
}
