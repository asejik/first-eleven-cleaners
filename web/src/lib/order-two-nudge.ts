import type { createAdminClient } from '@/lib/supabase/admin';
import { addDaysToDate, texasDate, texasDayStartUtc } from '@/lib/texas-time';
import { ORDER_TWO_DISCOUNT } from '@/lib/constants';
import { sendContactMessage } from '@/lib/messaging/contact';
import { greetingFirstName } from '@/lib/sanitize';
import { reportError } from '@/lib/error-reporting';
import { earlierPickups } from '@/lib/order-two';
import { rebookUrl } from '@/lib/rebook';
import { getOpenMembership } from '@/lib/routine-store';

/**
 * The Day 6 nudge (client 2026-10-14): "Day 6 after first delivery, if no second order: Eleven
 * sends a short nudge with the same one-tap link." Once per customer (order_two_nudged_at), by
 * the morning job. It's a marketing message, so it's a text only for customers who agreed to
 * promotional texts; everyone else gets it by email. Routine members never get it. Deliveries
 * from 6 to 9 days ago count, so a missed morning still catches them.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const NUDGE_AFTER_DAYS = 6;
const CATCH_UP_DAYS = 3;

export function orderTwoNudgeText(fullName: string | null | undefined, link: string): string {
  return `Eleven at First Eleven Cleaners: Hi ${greetingFirstName(fullName, 'there')}, ready for round two? Your next pickup is one tap away, and it's $${ORDER_TWO_DISCOUNT} off: ${link}. Reply STOP to opt out.`;
}

type Customer = { id: string; full_name: string | null; phone: string | null; email: string | null; sms_promotions_consent: boolean; order_two_nudged_at: string | null };
type One<T> = T | T[] | null | undefined;
const firstOf = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] : v) ?? null;

export async function sendOrderTwoNudges(supabase: AdminClient, now: Date = new Date()): Promise<{ sent: number }> {
  const today = texasDate(now);
  const newest = addDaysToDate(today, -NUDGE_AFTER_DAYS);
  const oldest = addDaysToDate(newest, -CATCH_UP_DAYS);
  const { data: events } = await supabase
    .from('order_events')
    .select('order_id')
    .eq('status', 'delivered')
    .gte('timestamp', texasDayStartUtc(oldest))
    .lt('timestamp', texasDayStartUtc(addDaysToDate(newest, 1)))
    .limit(500);
  const orderIds = [...new Set((events || []).map((e) => e.order_id))];
  let sent = 0;
  for (const orderId of orderIds) {
    try {
      const { data: order } = await supabase
        .from('orders')
        .select('id, customer_id, status, routine_membership_id, customer:customers!customer_id(id, full_name, phone, email, sms_promotions_consent, order_two_nudged_at)')
        .eq('id', orderId)
        .maybeSingle();
      const customer = firstOf(order?.customer as One<Customer>);
      if (!order || !customer || order.status !== 'delivered' || order.routine_membership_id || customer.order_two_nudged_at) continue;
      // Their first order, and no second one yet
      const pickups = await earlierPickups(supabase, order.customer_id);
      if (pickups.length !== 1) continue;
      if (await getOpenMembership(supabase, order.customer_id)) continue;
      // Claim it first, so two runs never nudge twice
      const { data: claimed } = await supabase
        .from('customers')
        .update({ order_two_nudged_at: now.toISOString() })
        .eq('id', customer.id)
        .is('order_two_nudged_at', null)
        .select('id');
      if (!claimed || claimed.length === 0) continue;
      const result = await sendContactMessage({
        phone: customer.phone,
        email: customer.email,
        smsConsent: Boolean(customer.sms_promotions_consent),
        title: 'Ready for round two?',
        body: orderTwoNudgeText(customer.full_name, rebookUrl(order.id, now)),
      });
      if (result.ok) sent += 1;
    } catch (err) {
      reportError('order-two/nudge', err, { details: `Order ${orderId}: Day 6 nudge not sent` });
    }
  }
  return { sent };
}
