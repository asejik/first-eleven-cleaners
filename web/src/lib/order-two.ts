import type { createAdminClient } from '@/lib/supabase/admin';
import { ORDER_TWO_DISCOUNT, ORDER_TWO_WINDOW_DAYS } from '@/lib/constants';
import { addDaysToDate } from '@/lib/texas-time';

/**
 * The order-two sequence (client 2026-10-14): "the metric we live by: a customer who completes
 * 2 orders in their first 21 days." The discount moves from order one to order two: $10 off a
 * customer's second order when its pickup is within 21 days of their first pickup, automatic,
 * no code. One-time orders only (a member's pricing replaces it; no combining), and never with
 * a promo code: the customer gets whichever is bigger. Account credit and a friend's referral
 * (on order one) are money, not promos, and still apply.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export { ORDER_TWO_DISCOUNT, ORDER_TWO_WINDOW_DAYS };

/** Given a customer's earlier pickups (not cancelled), is a pickup on this date their order two? */
export function isOrderTwo(earlierPickupDates: readonly string[], pickupDate: string): boolean {
  if (earlierPickupDates.length !== 1) return false;
  const first = earlierPickupDates[0];
  return pickupDate >= first && pickupDate <= addDaysToDate(first, ORDER_TWO_WINDOW_DAYS);
}

/** The customer's pickups so far (not cancelled), oldest first; optionally leaving one order out. */
export async function earlierPickups(supabase: AdminClient, customerId: string, { excludeOrderId }: { excludeOrderId?: string } = {}): Promise<string[]> {
  const { data } = await supabase
    .from('orders')
    .select('id, pickup_date')
    .eq('customer_id', customerId)
    .neq('status', 'cancelled')
    .order('pickup_date', { ascending: true })
    .limit(5);
  return (data || []).filter((o) => o.id !== excludeOrderId).map((o) => o.pickup_date);
}

/** $10 when a one-time pickup on this date is the customer's order two, else 0. */
export async function orderTwoDiscountFor(
  supabase: AdminClient,
  customerId: string | null | undefined,
  { pickupDate, frequency }: { pickupDate: string; frequency: string }
): Promise<number> {
  if (!customerId || frequency !== 'one_time') return 0;
  return isOrderTwo(await earlierPickups(supabase, customerId), pickupDate) ? ORDER_TWO_DISCOUNT : 0;
}
