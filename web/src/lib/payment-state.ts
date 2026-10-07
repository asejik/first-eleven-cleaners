/**
 * How Mission Control names an order's payment (client 2026-10-06, Part A) and the three
 * daily watch lists: Payment Needed (with the reminder ladder), card needed before pickup,
 * and card holds expiring within 48 hours, so none lapses before itemization.
 */
export interface PaymentStateOrder {
  id: string;
  order_number?: string | null;
  status: string;
  payment_status: string;
  total?: number | null;
  amount_due?: number | null;
  hold_status?: string | null;
  hold_expires_at?: string | null;
  payment_needed_since?: string | null;
  payment_reminder_stage?: number | null;
  pickup_date?: string | null;
  items?: Array<{
    id: string;
    garment_type: string;
    quantity: number;
    quote_status?: string;
    quoted_unit_price?: number | null;
    quote_requested_at?: string | null;
    quote_reminder_stage?: number;
  }> | null;
}

/** A quote above the 25% band waiting for the customer (Parts B-D). */
export interface AwaitingQuote {
  orderId: string;
  orderNumber: string;
  itemId: string;
  garmentType: string;
  amount: number;
  requestedAt: string | null;
  stage: number;
}

export type PaymentState =
  | { key: 'captured'; label: 'Captured'; tone: 'ok' }
  | { key: 'refunded'; label: 'Refunded'; tone: 'neutral' }
  | { key: 'payment_needed'; label: 'Payment Needed'; tone: 'alert'; amount: number }
  | { key: 'card_needed'; label: 'Card needed before pickup'; tone: 'alert' }
  | { key: 'authorized'; label: 'Authorized'; tone: 'info' }
  | { key: 'card_on_file'; label: 'Card on file'; tone: 'neutral' };

const owed = (o: PaymentStateOrder) => (Number(o.amount_due) > 0 ? Number(o.amount_due) : Number(o.total) || 0);

export function paymentState(o: PaymentStateOrder): PaymentState {
  if (o.payment_status === 'charged') return { key: 'captured', label: 'Captured', tone: 'ok' };
  if (o.payment_status === 'refunded') return { key: 'refunded', label: 'Refunded', tone: 'neutral' };
  if (o.payment_status === 'failed') return { key: 'payment_needed', label: 'Payment Needed', tone: 'alert', amount: owed(o) };
  if (o.status === 'booked' && o.hold_status === 'declined') {
    return { key: 'card_needed', label: 'Card needed before pickup', tone: 'alert' };
  }
  if (o.hold_status === 'held') return { key: 'authorized', label: 'Authorized', tone: 'info' };
  return { key: 'card_on_file', label: 'Card on file', tone: 'neutral' };
}

/** Where an order is on the Payment Needed ladder. */
export function ladderStep(stage: number | null | undefined): string {
  switch (Number(stage) || 0) {
    case 1:
      return 'Reminder sent';
    case 2:
      return 'Staff call due';
    case 3:
      return 'Owner decision';
    default:
      return 'Customer asked for a new card';
  }
}

const HOUR = 60 * 60 * 1000;

export interface PaymentWatchlists {
  paymentNeeded: PaymentStateOrder[];
  callList: PaymentStateOrder[];
  /** Quotes above the 25% band waiting for the customer, oldest first */
  quotesAwaiting: AwaitingQuote[];
  /** Quotes 48 h old with no answer: call the customer */
  quoteCalls: AwaitingQuote[];
  cardNeeded: PaymentStateOrder[];
  holdsExpiring: PaymentStateOrder[];
}

export function paymentWatchlists(orders: PaymentStateOrder[], now: Date = new Date()): PaymentWatchlists {
  const active = orders.filter((o) => o.status !== 'cancelled');
  const paymentNeeded = active
    .filter((o) => o.payment_status === 'failed')
    .sort((a, b) => String(a.payment_needed_since || '').localeCompare(String(b.payment_needed_since || '')));
  const quotesAwaiting = active
    .flatMap((o) =>
      (o.items || [])
        .filter((i) => i.quote_status === 'awaiting_approval')
        .map((i) => ({
          orderId: o.id,
          orderNumber: o.order_number || o.id.slice(0, 8),
          itemId: i.id,
          garmentType: i.garment_type,
          amount: Math.round((Number(i.quoted_unit_price) || 0) * i.quantity * 100) / 100,
          requestedAt: i.quote_requested_at || null,
          stage: Number(i.quote_reminder_stage) || 0,
        }))
    )
    .sort((a, b) => String(a.requestedAt || '').localeCompare(String(b.requestedAt || '')));
  return {
    quotesAwaiting,
    quoteCalls: quotesAwaiting.filter((q) => q.stage >= 2),
    paymentNeeded,
    // Staff call due (48 h) and owner decisions (7 days) both need a person today
    callList: paymentNeeded.filter((o) => (Number(o.payment_reminder_stage) || 0) >= 2),
    cardNeeded: active.filter((o) => o.status === 'booked' && o.hold_status === 'declined'),
    holdsExpiring: active
      .filter(
        (o) =>
          o.hold_status === 'held' &&
          Boolean(o.hold_expires_at) &&
          new Date(o.hold_expires_at as string).getTime() - now.getTime() <= 48 * HOUR
      )
      .sort((a, b) => String(a.hold_expires_at).localeCompare(String(b.hold_expires_at))),
  };
}
