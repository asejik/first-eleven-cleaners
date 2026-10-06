import {
  DRY_CLEAN_PRICES,
  catalogItems,
  catalogPriceLabel,
  type CatalogCategory,
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

/** "Label: $price" (or "from $price", with any note) for every catalog item in a category. */
export function dryCleanLines(category: CatalogCategory = 'dry_clean'): string[] {
  return catalogItems(category).map(
    ([, item]) => `${item.label}: ${catalogPriceLabel(item)}${item.note ? ` (${item.note})` : ''}`
  );
}

export function householdLines(): string[] {
  return dryCleanLines('household');
}

export const NO_LEATHER_LINE = "We don't clean leather or suede.";

/** Plant schedule and delivery days (client 2026-10-06). */
export function plantScheduleLine(lang: 'en' | 'es' = 'en'): string {
  return lang === 'es'
    ? 'Nuestra planta opera de lunes a viernes. Los pedidos estándar se entregan 2 días hábiles después de la recogida (recogida el jueves: entrega el lunes; el viernes: entrega el martes). Las recogidas del sábado se entregan el martes. El Express de 24 horas recoge de lunes a jueves (Express del jueves: entrega el viernes).'
    : 'Our plant runs Monday to Friday. Standard orders are delivered 2 plant days after pickup (Thursday pickups on Monday, Friday pickups on Tuesday). Saturday pickups are delivered Tuesday. 24-Hour Express pickups run Monday to Thursday (a Thursday Express pickup is delivered Friday).';
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
  const dryLabel = lang === 'es' ? 'Tintorería (por prenda)' : 'Dry Cleaning (per item)';
  const homeLabel = lang === 'es' ? 'Artículos del Hogar (por pieza)' : 'Household (per item)';
  const noLeather = lang === 'es' ? 'No limpiamos cuero ni gamuza.' : NO_LEATHER_LINE;
  return [
    `• **${washLabel}:** ${washFoldLine(lang)}`,
    '',
    `**${dryLabel}**`,
    ...dryCleanLines('dry_clean').map((l) => `• ${l}`),
    '',
    `**${homeLabel}**`,
    ...householdLines().map((l) => `• ${l}`),
    '',
    `${feesLine(lang)} ${noLeather}`,
  ].join('\n');
}
