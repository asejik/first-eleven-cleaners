import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { decideQuote } from '@/lib/quote-approval';
import { apiError } from '@/lib/api-errors';

/**
 * Approve or decline a quote above the 25% band (client 2026-10-06, Parts B-D). Reached from
 * the private tracking link in the quote message (the unguessable order UUID, the same access
 * as the pay link) or the customer's dashboard. Rate-limited per network and per order.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ONE_HOUR = 60 * 60 * 1000;

const QuoteSchema = z.object({
  item_id: z.guid(),
  decision: z.enum(['approve', 'decline']),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    const clientIp = getClientIp(request);
    const [ipCheck, orderCheck] = await Promise.all([
      checkRateLimitAsync(`order_quote_ip:${clientIp}`, 20, ONE_HOUR),
      checkRateLimitAsync(`order_quote_order:${id}`, 10, ONE_HOUR),
    ]);
    if (!ipCheck.allowed || !orderCheck.allowed) {
      return NextResponse.json({ error: 'Too many attempts. Please wait an hour or call us.' }, { status: 429 });
    }
    const parsed = QuoteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Please choose Approve or Decline.' }, { status: 400 });
    }

    const result = await decideQuote(createAdminClient(), {
      orderId: id,
      itemId: parsed.data.item_id,
      decision: parsed.data.decision,
      actorLabel: 'Customer (Quote Approval)',
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, message: result.message, charged: result.charged });
  } catch (err: unknown) {
    return apiError('api/orders/[id]/quote', err, 500);
  }
}
