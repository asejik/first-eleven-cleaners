import type { createAdminClient } from '@/lib/supabase/admin';
import { texasDate } from '@/lib/texas-time';
import { releaseOrderHold } from '@/lib/payment-capture';
import { getAppBaseUrl } from '@/lib/constants';
import { shortRunDate } from '@/lib/zone5-messages';

/**
 * "Reply SKIP to come off the list" (client 2026-10-08, the "route not reached" text): cancels
 * the sender's next Zone 5 pickup while it is still only booked, and releases any card hold.
 * Returns the reply to text back.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const SKIP_NOTHING_REPLY = 'First Eleven Cleaners: We could not find an upcoming Extended Reach pickup to skip. Questions? Just reply.';

export async function skipNextZone5Pickup(supabase: AdminClient, phoneE164: string, now: Date = new Date()): Promise<string> {
  // Every record with this number (a guest record and an account can share it)
  const { data: customers } = await supabase.from('customers').select('id').eq('phone', phoneE164).limit(10);
  const customerIds = (customers || []).map((c) => c.id);
  if (customerIds.length === 0) return SKIP_NOTHING_REPLY;

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, pickup_date, hold_payment_id, hold_status')
    .in('customer_id', customerIds)
    .not('extended_reach_band', 'is', null)
    .eq('status', 'booked')
    .gte('pickup_date', texasDate(now))
    .order('pickup_date')
    .limit(1)
    .maybeSingle();
  if (!order) return SKIP_NOTHING_REPLY;

  const { data: cancelled } = await supabase
    .from('orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('status', 'booked')
    .select('id');
  if (!cancelled || cancelled.length === 0) return SKIP_NOTHING_REPLY;

  await supabase.from('order_events').insert({
    order_id: order.id,
    status: 'cancelled',
    note: 'Extended Reach pickup cancelled by the customer (replied SKIP).',
    triggered_by: 'Customer (SMS)',
    timestamp: new Date().toISOString(),
  });
  await releaseOrderHold(supabase, order, 'pickup skipped by the customer by text');
  return `First Eleven Cleaners: Done. Your Extended Reach pickup on Wed ${shortRunDate(order.pickup_date)} is cancelled and nothing is charged. Book again anytime: ${getAppBaseUrl()}/book`;
}
