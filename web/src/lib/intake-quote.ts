import { DRY_CLEAN_PRICES, catalogLineTotal } from '@/lib/constants';

/**
 * Intake quotes for "from" items (client 2026-10-06): evening gowns, wedding dresses and
 * drapes have a starting price, and the plant can quote more at intake (a lined drape, a
 * heavily beaded gown). Only "from" items can be quoted, never below the listed starting
 * price, in whole cents, up to a sanity cap. Every other item is charged its catalog price.
 */
export const MAX_QUOTED_UNIT_PRICE = 2000;

/** Items unknown to the catalog keep the old intake fallback price. */
const UNKNOWN_ITEM_PRICE = 8.99;

export type IntakeLinePrice =
  | { ok: true; unitPrice: number; subtotal: number; quote?: { listed: number; quoted: number } }
  | { ok: false; error: string };

export function priceIntakeLine(garmentType: string, quantity: number, quotedUnitPrice?: number): IntakeLinePrice {
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
  return {
    ok: true,
    unitPrice: quotedCents / 100,
    subtotal: (quotedCents * quantity) / 100,
    quote: { listed: item.price, quoted: quotedCents / 100 },
  };
}
