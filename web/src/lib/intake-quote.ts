import { DRY_CLEAN_PRICES, catalogLineTotal } from '@/lib/constants';

/**
 * Intake quotes for "from" items (client 2026-10-06): evening gowns, wedding dresses and
 * drapes have a starting price, and the plant can quote more at intake (a lined drape, a
 * heavily beaded gown). Only "from" items can be quoted, never below the listed starting
 * price, in whole cents, up to a sanity cap. Every other item is charged its catalog price.
 */
export const MAX_QUOTED_UNIT_PRICE = 2000;
/** Quotes the customer pre-agreed to at checkout: up to 125% of the from-price (Part A) */
export const QUOTE_BAND_PERCENT = 125;

/** Items unknown to the catalog keep the old intake fallback price. */
const UNKNOWN_ITEM_PRICE = 8.99;

export type IntakeLinePrice =
  | {
      ok: true;
      unitPrice: number;
      subtotal: number;
      quote?: { listed: number; quoted: number };
      /** Quoted more than 25% above the from-price: not charged until the customer approves (Part C) */
      awaitingApproval?: boolean;
    }
  | { ok: false; error: string };

/** The highest price per piece the customer agreed to at checkout (125% of the from-price), in cents. */
export function quoteBandMaxCents(fromPrice: number): number {
  return Math.floor((Math.round(fromPrice * 100) * QUOTE_BAND_PERCENT) / 100);
}

export function priceIntakeLine(
  garmentType: string,
  quantity: number,
  quotedUnitPrice?: number,
  /** Intake: a quote above the band goes to the customer for approval instead of being refused */
  { allowApproval = false }: { allowApproval?: boolean } = {}
): IntakeLinePrice {
  const item = DRY_CLEAN_PRICES[garmentType];

  if (quotedUnitPrice === undefined || (item && quotedUnitPrice === item.price)) {
    if (!item) {
      return { ok: true, unitPrice: UNKNOWN_ITEM_PRICE, subtotal: Math.round(UNKNOWN_ITEM_PRICE * 100 * quantity) / 100 };
    }
    return { ok: true, unitPrice: item.price, subtotal: catalogLineTotal(garmentType, quantity) };
  }

  const label = item?.label || garmentType;
  if (!item?.fromPrice) {
    return { ok: false, error: `${label} has a fixed price and can't be quoted at intake.` };
  }
  const quotedCents = Math.round(quotedUnitPrice * 100);
  if (!Number.isFinite(quotedUnitPrice) || Math.abs(quotedUnitPrice * 100 - quotedCents) > 1e-6) {
    return { ok: false, error: `The quoted price for ${label} must be in dollars and cents.` };
  }
  if (quotedCents < Math.round(item.price * 100)) {
    return { ok: false, error: `The quoted price for ${label} can't be below its starting price of $${item.price.toFixed(2)}.` };
  }
  if (quotedCents > MAX_QUOTED_UNIT_PRICE * 100) {
    return { ok: false, error: `The quoted price for ${label} looks too high (over $${MAX_QUOTED_UNIT_PRICE}). Please re-check it.` };
  }
  // The customer agreed at checkout to quotes up to 25% above the from-price; more needs their
  // OK (client 2026-10-06): intake sends the quote and charges nothing for the item until then
  const bandMaxCents = quoteBandMaxCents(item.price);
  if (quotedCents > bandMaxCents) {
    if (!allowApproval) {
      return { ok: false, error: `The quoted price for ${label} is more than 25% above its starting price. Without the customer's OK it can be at most $${(bandMaxCents / 100).toFixed(2)}.` };
    }
    return {
      ok: true,
      unitPrice: item.price,
      subtotal: 0,
      quote: { listed: item.price, quoted: quotedCents / 100 },
      awaitingApproval: true,
    };
  }
  return {
    ok: true,
    unitPrice: quotedCents / 100,
    subtotal: (quotedCents * quantity) / 100,
    quote: { listed: item.price, quoted: quotedCents / 100 },
  };
}
