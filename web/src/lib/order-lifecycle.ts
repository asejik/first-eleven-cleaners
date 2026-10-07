import type { OrderStatusKey } from '@/lib/constants';

/**
 * Order lifecycle rules (P03 PR-02). Intake is the only place a card is charged, so an
 * order may only reach Weighed & Itemized through intake. Since the "see it as you pay it"
 * model (client 2026-10-06, Part A), cleaning goes ahead while a declined payment is
 * still needed; delivery waits until the payment is captured (or a manager override is
 * logged).
 */

/** Moves an admin may make from the Mission Control board. */
const MISSION_CONTROL_TRANSITIONS: Partial<Record<OrderStatusKey, OrderStatusKey[]>> = {
  booked: ['picked_up', 'cancelled'],
  weighed_itemized: ['in_cleaning'],
  in_cleaning: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
};

/** Stages an order may only enter once its card has been charged. */
const PAYMENT_REQUIRED_STAGES: readonly OrderStatusKey[] = ['out_for_delivery', 'delivered'];

export const ORDER_STATUS_KEYS = [
  'booked',
  'picked_up',
  'weighed_itemized',
  'in_cleaning',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const satisfies readonly OrderStatusKey[];

export type TransitionCheck = { ok: true } | { ok: false; error: string };

export function checkMissionControlTransition(from: string, to: string): TransitionCheck {
  if (from === 'picked_up' && to === 'weighed_itemized') {
    return { ok: false, error: 'Weigh and itemize this bag at the Intake Station; intake charges the card on file.' };
  }
  const allowed = MISSION_CONTROL_TRANSITIONS[from as OrderStatusKey] || [];
  if (!allowed.includes(to as OrderStatusKey)) {
    return { ok: false, error: `An order can't move from ${from.replace(/_/g, ' ')} to ${to.replace(/_/g, ' ')}.` };
  }
  return { ok: true };
}

export function requiresCapturedPayment(stage: string): boolean {
  return (PAYMENT_REQUIRED_STAGES as readonly string[]).includes(stage);
}

/**
 * Intake runs on a picked-up bag, or again on a weighed order nothing has been captured from
 * yet (a re-weigh before charging). Never on paid, cancelled or delivered orders, and never
 * once part of the total was captured (the rest is collected as Payment Needed).
 */
export function checkIntakeAllowed(
  status: string,
  paymentStatus: string | null | undefined,
  { alreadyCaptured = false }: { alreadyCaptured?: boolean } = {}
): TransitionCheck {
  if (status === 'booked') {
    return { ok: false, error: 'Cannot process intake: Bag has not been picked up yet. Driver must complete pickup first.' };
  }
  if (status === 'picked_up') return { ok: true };
  if (status === 'weighed_itemized' && paymentStatus !== 'charged' && paymentStatus !== 'refunded') {
    if (alreadyCaptured) {
      return { ok: false, error: 'Part of this order was already charged. Collect the rest from Mission Control (Payment Needed) instead of re-running intake.' };
    }
    return { ok: true };
  }
  return { ok: false, error: `Intake is closed for this order (status: ${status.replace(/_/g, ' ')}, payment: ${paymentStatus || 'unknown'}).` };
}
