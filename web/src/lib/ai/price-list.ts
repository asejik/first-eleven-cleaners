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
  EXTENDED_REACH_LABEL,
  EXTENDED_REACH_BAND_CITIES,
  extendedReachTurnaroundLine,
  ZONE_CONFIG,
  ROUTINE_PLAN_DISCOUNT_PERCENT,
  memberWashFoldRate,
  memberZoneMinimum,
} from '@/lib/constants';
import { DEFAULT_COVERAGE, feeLabel, extendedReachStartLine, type Coverage } from '@/lib/coverage';

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

/** Routine member pricing (client 2026-10-08): one rule, everything but alterations and fees. */
export function routinePricingLine(lang: 'en' | 'es' = 'en'): string {
  const w = money(memberWashFoldRate('weekly'));
  const b = money(memberWashFoldRate('biweekly'));
  const z1w = money(memberZoneMinimum(ZONE_CONFIG.zone_1, 'weekly'));
  const z1b = money(memberZoneMinimum(ZONE_CONFIG.zone_1, 'biweekly'));
  return lang === 'es'
    ? `Miembros Routine (recogida fija): Semanal ${ROUTINE_PLAN_DISCOUNT_PERCENT.weekly}% de descuento, Quincenal ${ROUTINE_PLAN_DISCOUNT_PERCENT.biweekly}%, en todo excepto arreglos y cargos (Wash & Fold ${w}/lb semanal, ${b}/lb quincenal; mínimo de ${WASH_FOLD_MINIMUM_LBS} lbs). Mínimo de Zona 1 para miembros: ${z1w} / ${z1b}. Los códigos promocionales no se combinan con el precio de miembro.`
    : `Routine members (a standing pickup): Weekly ${ROUTINE_PLAN_DISCOUNT_PERCENT.weekly}% off, Bi-Weekly ${ROUTINE_PLAN_DISCOUNT_PERCENT.biweekly}% off everything except alterations and fees (wash & fold ${w}/lb Weekly, ${b}/lb Bi-Weekly; the ${WASH_FOLD_MINIMUM_LBS}-lb floor stays). Zone 1 member minimum: ${z1w} Weekly / ${z1b} Bi-Weekly; Zones 2-5 keep their minimum. Promo codes don't combine with member pricing.`;
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

export function alterationLines(): string[] {
  return dryCleanLines('alteration');
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
    ? `Se agregan un cargo ambiental de ${pct(ENVIRONMENTAL_FEE_RATE)} y el impuesto de Texas de ${pct(TX_SALES_TAX_RATE)}. Recogida y entrega gratis en todo el Metroplex (la Zona 5, Extended Reach, tiene un cargo de entrega).`
    : `A ${pct(ENVIRONMENTAL_FEE_RATE)} environmental fee and ${pct(TX_SALES_TAX_RATE)} Texas sales tax are added at checkout. Pickup and delivery are free across the DFW Metroplex (Zones 1-4); Zone 5 Extended Reach has a delivery fee.`;
}

/**
 * The five zones (client 2026-10-07, request 8), from the live coverage settings: Zones 1-4
 * with their distance bands, minimums, route days and Express; then Zone 5.
 */
export function zoneMinimumLines(coverage: Coverage = DEFAULT_COVERAGE): string[] {
  return [
    ...coverage.zonesList.map(
      (z) =>
        `${z.name} (about ${z.minMiles}-${z.maxMiles} mi from the plant): ${money(z.minimumOrder)} order minimum, free delivery, ${z.routeScheduleLabel}${z.expressEligible ? ', 24-Hour Express Mon-Thu' : ', no Express'}. Areas: ${z.cities.join(', ')}.`
    ),
    ...extendedReachLines(coverage),
  ];
}

/** Zone 5: distance bands, fee, minimum, Routine discount, threshold, cadence, waitlist. */
export function extendedReachLines(coverage: Coverage = DEFAULT_COVERAGE): string[] {
  const r = coverage.extendedReach;
  const z = coverage.extendedReachZone;
  return [
    `${z.name} (beyond the Metroplex): ${money(r.minimumOrder)} order minimum plus an ${EXTENDED_REACH_LABEL} fee by driving distance from the plant: ${r.bands
      .map((b) => `${b.minMiles}-${b.maxMiles} mi ${feeLabel(b.fee)} (${EXTENDED_REACH_BAND_CITIES[b.id].join(', ')}; new pickups open at ${b.dispatchThreshold} bookings)`)
      .join('; ')}. The fee is its own line, taxed like any line. Routine members (Weekly or Bi-Weekly plan) get ${r.routineDiscountPercent}% off the fee. No Express.`,
    `${extendedReachTurnaroundLine(r)} A run always goes out when deliveries are due, so clothes are never held. New pickups are accepted for a run once enough neighbors book or when a delivery is already due there that day; otherwise the pickup moves to the next run automatically and the customer is told.`,
    ...(r.firstRunDate ? [] : [`Zone 5 hasn't started yet: say "${extendedReachStartLine(r)}" and offer the waitlist on the booking page.`]),
    `Beyond ${r.waitlistBeyondMiles} miles: no booking yet; the customer can join the waitlist on the booking page ("Not in your area yet").`,
  ];
}

/** How the zone is chosen, and route-day delivery (client 8A-8B). */
export function zoneRulesLine(): string {
  return `Zones 1-4 follow their published area lists; an address not on a list is placed by driving distance from our plant in North Dallas (0-15 mi Zone 1, 15-25 Zone 2, 25-35 Zone 3, 35-45 Zone 4, 45-80 Zone 5; don't share the plant's street address). Zones 3 and 4 pick up on their route days and deliver on the next route day once the plant has the order ready (a Zone 4 Friday pickup is delivered Tuesday). The booking page shows the exact zone, fee and dates for an address.`;
}

export function expressLine(coverage: Coverage = DEFAULT_COVERAGE): string {
  if (!coverage.expressEnabled) {
    return `24-Hour Express is coming soon (+${pct(EXPRESS_SURCHARGE_PERCENT)} of the order subtotal, Monday-Thursday morning pickups, Zones 1 and 2). It can't be booked yet; every order gets our 48-hour turnaround.`;
  }
  return `24-Hour Express: +${pct(EXPRESS_SURCHARGE_PERCENT)} of the order subtotal (the zone order minimum still applies), Monday-Thursday morning pickups in Zones 1 and 2.`;
}

/** Bullet list for chat replies. */
export function chatPriceList(lang: 'en' | 'es' = 'en'): string {
  const washLabel = lang === 'es' ? 'Lavandería Wash & Fold' : 'Wash & Fold Laundry';
  const dryLabel = lang === 'es' ? 'Tintorería (por prenda)' : 'Dry Cleaning (per item)';
  const homeLabel = lang === 'es' ? 'Artículos del Hogar (por pieza)' : 'Household (per item)';
  const altLabel = lang === 'es' ? 'Arreglos (por pieza, 3-5 días hábiles)' : 'Alterations (per item, 3-5 business days)';
  const noLeather = lang === 'es' ? 'No limpiamos cuero ni gamuza.' : NO_LEATHER_LINE;
  return [
    `• **${washLabel}:** ${washFoldLine(lang)}`,
    `• ${routinePricingLine(lang)}`,
    '',
    `**${dryLabel}**`,
    ...dryCleanLines('dry_clean').map((l) => `• ${l}`),
    '',
    `**${homeLabel}**`,
    ...householdLines().map((l) => `• ${l}`),
    '',
    `**${altLabel}**`,
    ...alterationLines().map((l) => `• ${l}`),
    '',
    `${feesLine(lang)} ${noLeather}`,
  ].join('\n');
}
