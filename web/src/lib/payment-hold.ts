import { addDaysToDate, texasDate } from '@/lib/texas-time';

/**
 * "See it as you pay it" (client 2026-10-06, Part A). The card is held for the estimate and
 * charged automatically once the order is weighed and itemized at intake.
 *
 * - Hold amount: the estimated total (tax and fee included) x 1.20, at least $45 or the
 *   zone's order minimum if higher.
 * - When: at booking if pickup is within 2 days; otherwise the daily job places it 2 days
 *   before pickup (Square cancels an uncaptured hold after 7 days).
 * - Intake: total at or below the hold -> lower the hold to the total and capture it;
 *   above the hold -> capture the hold and charge the difference to the card on file;
 *   no active hold -> charge the card on file.
 */
export const HOLD_BUFFER_PERCENT = 120;
export const HOLD_MINIMUM = 45;
export const HOLD_LEAD_DAYS = 2;

/** Checkout acceptance wording (client 2026-10-06). The version is stored with the order. */
export const PAYMENT_TERMS_VERSION = '2026-10-06';
export const PAYMENT_TERMS_TEXT =
  'Your card is authorized now for the estimated total and charged automatically once your order is weighed and itemized at Pickup. Quoted items may be confirmed up to 25% above the listed from-price; anything higher needs your OK.';
/** Same terms for a pickup more than 2 days away, whose hold is placed later. */
export const PAYMENT_TERMS_TEXT_SCHEDULED =
  'Your card is authorized 2 days before your pickup for the estimated total and charged automatically once your order is weighed and itemized at Pickup. Quoted items may be confirmed up to 25% above the listed from-price; anything higher needs your OK.';

const toCents = (dollars: number) => Math.round(dollars * 100);

/** The amount to hold for an estimated total, in dollars (whole cents). */
export function holdAmountFor(estimatedTotal: number, zoneMinimum = 0): number {
  const buffered = Math.round((toCents(estimatedTotal) * HOLD_BUFFER_PERCENT) / 100);
  const floor = toCents(Math.max(HOLD_MINIMUM, zoneMinimum));
  return Math.max(buffered, floor) / 100;
}

/** True when the hold for this pickup should be placed now (pickup within 2 days, Dallas time). */
export function shouldPlaceHoldNow(pickupDate: string, now: Date = new Date()): boolean {
  return pickupDate <= addDaysToDate(texasDate(now), HOLD_LEAD_DAYS);
}

export type CapturePlan =
  /** Lower the hold to the total (if needed) and capture it */
  | { kind: 'capture_hold'; captureAmount: number; lowerHold: boolean }
  /** Capture the whole hold, then charge the rest to the card on file */
  | { kind: 'capture_hold_and_charge_rest'; captureAmount: number; rest: number }
  /** No usable hold: charge the whole total to the card on file */
  | { kind: 'charge_card'; amount: number };

export function planCapture({
  total,
  holdAmount,
  holdActive,
}: {
  total: number;
  holdAmount: number | null | undefined;
  holdActive: boolean;
}): CapturePlan {
  const totalCents = toCents(total);
  const holdCents = toCents(Number(holdAmount) || 0);
  if (!holdActive || holdCents <= 0) return { kind: 'charge_card', amount: totalCents / 100 };
  if (totalCents <= holdCents) {
    return { kind: 'capture_hold', captureAmount: totalCents / 100, lowerHold: totalCents < holdCents };
  }
  return { kind: 'capture_hold_and_charge_rest', captureAmount: holdCents / 100, rest: (totalCents - holdCents) / 100 };
}

/** A hold Square can still capture: placed, not captured or released, and not past its expiry. */
export function isHoldActive(
  order: { hold_status?: string | null; hold_payment_id?: string | null; hold_expires_at?: string | null },
  now: Date = new Date()
): boolean {
  if (order.hold_status !== 'held' || !order.hold_payment_id) return false;
  return !order.hold_expires_at || new Date(order.hold_expires_at).getTime() > now.getTime();
}
