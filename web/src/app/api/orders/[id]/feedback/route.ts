import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { apiError } from '@/lib/api-errors';
import { reportError } from '@/lib/error-reporting';

/**
 * The two taps on the itemized ticket (client 2026-10-06, Part A): "Looks good" closes the
 * loop; "Something's off" opens a Make It Right claim that staff resolve the same day,
 * refund first. Cleaning goes on either way.
 *
 * Reached from the tracking link in the receipt, which carries the unguessable order UUID
 * (the same access the public tracking page and the pay link have), so guests can use it
 * without an account. Rate-limited per network and per order.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ONE_HOUR = 60 * 60 * 1000;

const FeedbackSchema = z.discriminatedUnion('response', [
  z.object({ response: z.literal('looks_good') }),
  z.object({
    response: z.literal('something_off'),
    message: z
      .string()
      .trim()
      .min(5, 'Please tell us briefly what looks wrong.')
      .max(1000, 'Please keep it under 1,000 characters.'),
  }),
]);

/** Stages with an itemized ticket to respond to */
const TICKET_STAGES = ['weighed_itemized', 'in_cleaning', 'out_for_delivery', 'delivered'];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const clientIp = getClientIp(request);
    const [ipCheck, orderCheck] = await Promise.all([
      checkRateLimitAsync(`order_feedback_ip:${clientIp}`, 10, ONE_HOUR),
      checkRateLimitAsync(`order_feedback_order:${id}`, 5, ONE_HOUR),
    ]);
    if (!ipCheck.allowed || !orderCheck.allowed) {
      return NextResponse.json({ error: 'Too many responses. Please wait an hour or call us.' }, { status: 429 });
    }

    const parsed = FeedbackSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Please choose a response.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, status, customer_id')
      .eq('id', id)
      .maybeSingle();
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    if (!TICKET_STAGES.includes(order.status)) {
      return NextResponse.json({ error: 'Your itemized ticket is ready once your order is weighed at the plant.' }, { status: 409 });
    }

    const orderRef = order.order_number || order.id.slice(0, 8);

    if (parsed.data.response === 'looks_good') {
      await supabase.from('order_events').insert({
        order_id: order.id,
        status: 'customer_feedback',
        note: 'Customer confirmed the itemized ticket looks good.',
        triggered_by: 'Customer (Tracking Page)',
      });
      return NextResponse.json({ success: true, message: 'Thanks for confirming. Your order is in good hands.' });
    }

    const { error: claimErr } = await supabase.from('claims').insert({
      order_id: order.id,
      customer_id: order.customer_id,
      issue_type: 'other',
      description: `[From the itemized ticket: "Something's off"] ${parsed.data.message}`,
    });
    if (claimErr) {
      return apiError('api/orders/[id]/feedback', claimErr, 500);
    }
    await supabase.from('order_events').insert({
      order_id: order.id,
      status: 'customer_feedback',
      note: 'Customer reported something off on the itemized ticket. Make It Right claim opened.',
      triggered_by: 'Customer (Tracking Page)',
    });
    // Same-day promise: tell an admin now
    reportError('make-it-right/ticket', `Customer reported something off on order ${orderRef}`, {
      alert: true,
      details: `Order ${orderRef}: "${parsed.data.message.slice(0, 300)}". Resolve today in Mission Control > Claims (refund first).`,
    });

    return NextResponse.json({
      success: true,
      message: "Thanks for telling us. We've opened a Make It Right claim and will contact you today.",
    });
  } catch (err: unknown) {
    return apiError('api/orders/[id]/feedback', err, 500);
  }
}
