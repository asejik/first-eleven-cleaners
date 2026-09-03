import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import { messagingService } from '@/lib/messaging';
import type { MessagePayload } from '@/lib/messaging/templates';
import type { OrderStatusKey } from '@/lib/constants';

export async function GET(request: Request) {
  const auth = await verifyApiAuth(['admin', 'driver', 'intake_staff'], request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('order_id');

  try {
    const supabase = createAdminClient();

    const query = supabase
      .from('conversations')
      .select(`
        id,
        customer_id,
        channel,
        messages,
        created_at,
        updated_at,
        customer:customers(id, full_name, phone, email)
      `)
      .order('updated_at', { ascending: false })
      .limit(50);

    const { data: conversations, error } = await query;

    if (error) {
      console.warn('Notifications GET error:', error);
      return NextResponse.json({ notifications: [] });
    }

    // Flatten all message entries into a clean chronological list for the simulator HUD
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
    }> = [];

    conversations?.forEach((conv) => {
      const customerData = conv.customer as { full_name?: string; phone?: string } | null;
      const msgs = Array.isArray(conv.messages) ? conv.messages : [];
      msgs.forEach((m: {
        id?: string;
        order_id?: string;
        stage?: OrderStatusKey;
        text?: string;
        media_url?: string | null;
        mode?: string;
        created_at?: string;
      }) => {
        if (!orderId || m.order_id === orderId) {
          allNotifications.push({
            id: m.id || crypto.randomUUID(),
            order_id: m.order_id,
            customer_name: customerData?.full_name || 'Customer',
            customer_phone: customerData?.phone || '',
            channel: conv.channel as 'sms' | 'whatsapp',
            stage: m.stage || 'booked',
            text: m.text || '',
            media_url: m.media_url || null,
            mode: m.mode || 'simulated',
            created_at: m.created_at || conv.updated_at,
          });
        }
      });
    });

    // Sort newest first
    allNotifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ notifications: allNotifications });
  } catch (err) {
    console.error('Notifications query error:', err);
    return NextResponse.json({ notifications: [] });
  }
}

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit(`notif:${clientIp}`, 20, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: 'Too many dispatch requests.' }, { status: 429 });
    }

    const auth = await verifyApiAuth(['admin', 'driver', 'intake_staff'], request);
    if (auth.errorResponse) return auth.errorResponse;

    const body = await request.json();
    const { order_id, stage, channel = 'sms', photo_url } = body;

    if (!order_id || !stage) {
      return NextResponse.json({ error: 'order_id and stage are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch order with customer
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order_id);
    const { data: order, error: orderErr } = isUUID
      ? await supabase.from('orders').select('*, customer:customers(*)').eq('id', order_id).maybeSingle()
      : await supabase.from('orders').select('*, customer:customers(*)').eq('order_number', order_id).maybeSingle();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const customer = order.customer as { full_name?: string; phone?: string } | null;
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const trackingUrl = `${origin}/track/${order.id}`;

    const payload: MessagePayload = {
      orderId: order.id,
      orderNumber: order.order_number || order.id.slice(0, 8),
      customerName: customer?.full_name || 'Valued Customer',
      customerPhone: customer?.phone || '+12145550199',
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
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
