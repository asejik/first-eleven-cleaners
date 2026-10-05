import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { messagingService } from '@/lib/messaging';
import { getAppBaseUrl, ORDER_STATUSES, type OrderStatusKey } from '@/lib/constants';
import type { MessagePayload } from '@/lib/messaging/templates';
import { apiError } from '@/lib/api-errors';
import { withSignedPhotoUrls } from '@/lib/storage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


export async function GET(request: Request) {
  const auth = await verifyApiAuth(['admin', 'driver', 'intake_staff'], request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('order_id');

  try {
    const supabase = createAdminClient();

    // Latest messages, one row each (PR-26)
    if (orderId && !UUID_RE.test(orderId)) {
      return NextResponse.json({ notifications: [] });
    }
    let query = supabase
      .from('messages')
      .select(`
        id,
        order_id,
        channel,
        stage,
        body,
        media_url,
        mode,
        created_at,
        customer:customers(full_name, phone)
      `)
      .order('created_at', { ascending: false })
      .limit(200);
    if (orderId) query = query.eq('order_id', orderId);

    const { data: messages, error } = await query;

    if (error) {
      console.warn('Notifications GET error:', error);
      return NextResponse.json({ notifications: [] });
    }

    // Newest first, in the shape the simulator HUD expects
    const allNotifications: Array<{
      id: string;
      order_id?: string;
      customer_name?: string;
      customer_phone?: string;
      channel: 'sms' | 'whatsapp';
      stage: OrderStatusKey;
      text: string;
      media_url: string | null;
      mode: string;
      created_at: string;
    }> = (messages || []).map((m) => {
      const customerData = (Array.isArray(m.customer) ? m.customer[0] : m.customer) as
        | { full_name?: string; phone?: string }
        | null;
      return {
        id: m.id,
        order_id: m.order_id || undefined,
        customer_name: customerData?.full_name || 'Customer',
        customer_phone: customerData?.phone || '',
        channel: m.channel as 'sms' | 'whatsapp',
        stage: (m.stage || 'booked') as OrderStatusKey,
        text: m.body || '',
        media_url: m.media_url || null,
        mode: m.mode || 'simulated',
        created_at: m.created_at,
      };
    });

    return NextResponse.json(await withSignedPhotoUrls({ notifications: allNotifications }));
  } catch (err) {
    console.error('Notifications query error:', err);
    return NextResponse.json({ notifications: [] });
  }
}

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = await checkRateLimitAsync(`notif:${clientIp}`, 20, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: 'Too many dispatch requests.' }, { status: 429 });
    }

    // Manual re-send is an admin tool (P05 AR-01). Drivers, intake and the board send
    // their own stage messages server-side when an order actually moves.
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;

    const body = await request.json();
    const { order_id, stage, channel = 'sms', photo_url } = body;

    if (!order_id || !stage) {
      return NextResponse.json({ error: 'order_id and stage are required' }, { status: 400 });
    }
    if (!ORDER_STATUSES.some((s) => s.key === stage)) {
      return NextResponse.json({ error: 'Unknown order stage.' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch order with customer (explicit columns only)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order_id);
    const orderCols = 'id, order_number, status, pickup_date, pickup_window, delivery_date, delivery_window, weight_lbs, total, customer:customers!customer_id(id, full_name, phone)';
    const { data: order, error: orderErr } = isUUID
      ? await supabase.from('orders').select(orderCols).eq('id', order_id).maybeSingle()
      : await supabase.from('orders').select(orderCols).eq('order_number', order_id).maybeSingle();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Only the order's current status can be re-sent, so a customer is never told
    // something that hasn't happened (P05 AR-01)
    if (order.status !== stage) {
      return NextResponse.json(
        { error: `This order is "${order.status}". Only its current status message can be re-sent.` },
        { status: 409 }
      );
    }

    const customer = order.customer as { full_name?: string; phone?: string } | null;
    const origin = getAppBaseUrl();
    const trackingUrl = `${origin}/track/${order.id}`;


    const payload: MessagePayload = {
      orderId: order.id,
      orderNumber: order.order_number || order.id.slice(0, 8),
      customerName: customer?.full_name || 'Valued Customer',
      customerPhone: customer?.phone || '',
      // No phone on file: email only, never a placeholder number (PR-22)
      ...(customer?.phone ? {} : { smsConsent: false }),
      stage: stage as OrderStatusKey,
      pickupDate: order.pickup_date,
      pickupWindow: order.pickup_window,
      deliveryDate: order.delivery_date,
      deliveryWindow: order.delivery_window,
      weightLbs: order.weight_lbs,
      total: order.total,
      photoUrl: photo_url,
      trackingUrl,
    };

    const dispatchResult = await messagingService.dispatchStageNotification(payload, channel);

    return NextResponse.json({
      success: true,
      result: dispatchResult,
    });
  } catch (err: unknown) {
    return apiError('api/notifications', err, 500);
  }
}
