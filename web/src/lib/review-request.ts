import type { createAdminClient } from '@/lib/supabase/admin';
import { getAppBaseUrl } from '@/lib/constants';
import { addDaysToDate, texasDate, texasDayStartUtc } from '@/lib/texas-time';
import { sendContactMessage } from '@/lib/messaging/contact';
import { greetingFirstName } from '@/lib/sanitize';
import { reportError } from '@/lib/error-reporting';
import { fillMessage } from '@/lib/message-tests';
import { pickMessage, recordSendChannel } from '@/lib/message-tests-store';
import { REVIEW_PATH } from '@/lib/google-reviews';

/**
 * The Google review request (client review 2026-10-20, #14: "a process for inviting customers to
 * leave a Google review after their order has been completed"). The morning after a delivery,
 * once per customer ever (a review_request row in message_sends). Every customer is asked,
 * whatever they told us: Google does not allow asking only happy customers. It's a request, not
 * an order update, so it's a text only for customers who agreed to promotional texts; everyone
 * else gets it by email. The text is edited and A/B tested in Mission Control > Message Tests;
 * its tracked link opens /review, which goes on to Google. Deliveries 1 to 3 days ago count, so a
 * missed morning still catches them.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const REVIEW_REQUEST_AFTER_DAYS = 1;
const CATCH_UP_DAYS = 2;
export const REVIEW_REQUEST_KEY = 'review_request' as const;

type Customer = { id: string; full_name: string | null; phone: string | null; email: string | null; role: string | null; sms_promotions_consent: boolean };
type One<T> = T | T[] | null | undefined;
const firstOf = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] : v) ?? null;

/** The email has no "Reply STOP" line; that only means something in a text */
export function reviewRequestEmailText(text: string): string {
  return text.replace(/\s*Reply STOP to opt out\.?\s*$/i, '').trim();
}

export async function sendReviewRequests(supabase: AdminClient, now: Date = new Date()): Promise<{ sent: number }> {
  const today = texasDate(now);
  const newest = addDaysToDate(today, -REVIEW_REQUEST_AFTER_DAYS);
  const oldest = addDaysToDate(newest, -CATCH_UP_DAYS);
  const { data: events } = await supabase
    .from('order_events')
    .select('order_id')
    .eq('status', 'delivered')
    .gte('timestamp', texasDayStartUtc(oldest))
    .lt('timestamp', texasDayStartUtc(addDaysToDate(newest, 1)))
    .limit(500);
  const orderIds = [...new Set((events || []).map((e) => e.order_id))];
  const asked = new Set<string>();
  let sent = 0;
  for (const orderId of orderIds) {
    try {
      const { data: order } = await supabase
        .from('orders')
        .select('id, customer_id, status, customer:customers!customer_id(id, full_name, phone, email, role, sms_promotions_consent)')
        .eq('id', orderId)
        .maybeSingle();
      const customer = firstOf(order?.customer as One<Customer>);
      if (!order || !customer || order.status !== 'delivered' || asked.has(customer.id)) continue;
      // Staff test orders aren't asked
      if (customer.role && customer.role !== 'customer') continue;
      asked.add(customer.id);
      // Once per customer, ever
      const { count } = await supabase
        .from('message_sends')
        .select('id', { count: 'exact', head: true })
        .eq('message_key', REVIEW_REQUEST_KEY)
        .eq('customer_id', customer.id);
      if ((count ?? 0) > 0) continue;
      const picked = await pickMessage(supabase, {
        key: REVIEW_REQUEST_KEY,
        recipient: customer.id,
        customerId: customer.id,
        orderId: order.id,
        targetUrl: `${getAppBaseUrl()}${REVIEW_PATH}`,
      });
      // The recorded send is what keeps it to once; without it, try again tomorrow
      if (!picked.sendId) continue;
      const body = fillMessage(picked.text, { 'First name': greetingFirstName(customer.full_name, 'there'), link: picked.link });
      const result = await sendContactMessage({
        phone: customer.phone,
        email: customer.email,
        smsConsent: Boolean(customer.sms_promotions_consent),
        title: 'How did we do?',
        body,
        emailBody: reviewRequestEmailText(body),
      });
      await recordSendChannel(supabase, picked.sendId, result.ok ? result.channel : 'none');
      if (result.ok) sent += 1;
    } catch (err) {
      reportError('review-request', err, { details: `Order ${orderId}: review request not sent` });
    }
  }
  return { sent };
}
