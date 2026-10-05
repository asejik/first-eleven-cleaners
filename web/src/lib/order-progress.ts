import { ORDER_STATUSES } from '@/lib/constants';
import { texasDate, texasDateTime } from '@/lib/texas-time';

/**
 * The six stages an order moves through, for progress timelines. "Cancelled" is an
 * outcome, not a step, so it is never drawn as one (P05 AR-04).
 */
export const PROGRESS_STAGES = ORDER_STATUSES.filter((s) => s.key !== 'cancelled');

/** Position of the order on the timeline; -1 for a cancelled (or unknown) status. */
export function progressIndex(status: string): number {
  return PROGRESS_STAGES.findIndex((s) => s.key === status);
}

/** "Wed, Oct 7 (Morning)" for a YYYY-MM-DD date and window, in the app's usual style (P05 AR-10). */
export function formatDeliveryDate(date?: string | null, window?: string | null): string {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return '';
  // Built in UTC and formatted in UTC so the calendar day never shifts with the phone's time zone
  const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return window ? `${label} (${window.charAt(0).toUpperCase()}${window.slice(1)})` : label;
}

/** Dallas hour after which an undelivered order counts as late (morning window plus a grace period). */
const LATE_AFTER_HOUR = { morning: 12, evening: 20 } as const;

/** Whether an order has missed its delivery window, judged in Dallas time (P05 AR-10). */
export function isDeliveryLate(
  order: { status: string; delivery_date?: string | null; delivery_window?: string | null },
  now: Date = new Date()
): boolean {
  if (order.status === 'delivered' || order.status === 'cancelled' || !order.delivery_date) return false;
  const tx = texasDateTime(now);
  if (tx.date !== order.delivery_date) return tx.date > order.delivery_date;
  const hour = order.delivery_window === 'morning' ? LATE_AFTER_HOUR.morning : LATE_AFTER_HOUR.evening;
  return tx.minutes >= hour * 60;
}

/** The Dallas date a delivered order was dropped off: its delivery photo, else its last update. */
export function deliveredOnDate(order: {
  updated_at?: string | null;
  photos?: Array<{ photo_type?: string; captured_at?: string | null }> | null;
}): string | null {
  const proof = order.photos?.filter((p) => p.photo_type === 'delivery_proof' && p.captured_at).pop();
  const when = proof?.captured_at || order.updated_at;
  return when ? texasDate(when) : null;
}
