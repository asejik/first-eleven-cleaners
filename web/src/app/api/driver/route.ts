import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { messagingService } from '@/lib/messaging';
import type { MessagePayload } from '@/lib/messaging/templates';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shift = searchParams.get('shift') || 'all'; // 'morning' | 'evening' | 'all'
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  try {
    const supabase = createAdminClient();

    // Fetch all active orders
    const { data: allOrders, error } = await supabase
      .from('orders')
      .select(`
        *,
        customer:customers(id, full_name, phone, email),
        address:addresses(id, street, unit, city, state, zip, delivery_notes),
        photos:garment_photos(*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Driver GET error:', error);
      return NextResponse.json({ pickups: [], deliveries: [] });
    }

    const pickups = (allOrders || []).filter((o) => {
      const matchStatus = o.status === 'booked';
      const matchShift = shift === 'all' || o.pickup_window === shift;
      return matchStatus && matchShift;
    });

    const deliveries = (allOrders || []).filter((o) => {
      const matchStatus = o.status === 'in_cleaning' || o.status === 'out_for_delivery';
      const matchShift = shift === 'all' || !o.delivery_window || o.delivery_window === shift;
      return matchStatus && matchShift;
    });

    const pickedUpHistory = (allOrders || []).filter((o) => {
      const isPickedUp = o.status === 'picked_up' || o.status === 'weighed_itemized' || o.status === 'in_cleaning';
      const matchShift = shift === 'all' || o.pickup_window === shift;
      return isPickedUp && matchShift;
    });

    const completed = (allOrders || []).filter((o) => o.status === 'delivered').slice(0, 15);

    return NextResponse.json({
      pickups,
      picked_up_history: pickedUpHistory,
      deliveries,
      completed,
      meta: {
        total_pickups: pickups.length,
        total_picked_up: pickedUpHistory.length,
        total_deliveries: deliveries.length,
        selected_shift: shift,
        date,
      },
    });
  } catch (err) {
    console.error('Driver API error:', err);
    return NextResponse.json({ pickups: [], picked_up_history: [], deliveries: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, order_id, photo_url, notes = '' } = body;

    if (!action || !order_id) {
      return NextResponse.json({ error: 'action and order_id are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch order with customer
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, customer:customers(*)')
      .eq('id', order_id)
      .maybeSingle();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const customer = order.customer as { full_name?: string; phone?: string } | null;
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const trackingUrl = `${origin}/track/${order.id}`;

    const basePayload: MessagePayload = {
      orderId: order.id,
      orderNumber: order.order_number || order.id.slice(0, 8),
      customerName: customer?.full_name || 'Valued Customer',
      customerPhone: customer?.phone || '+12145550199',
      stage: 'picked_up',
      pickupDate: order.pickup_date,
      pickupWindow: order.pickup_window,
      deliveryDate: order.delivery_date,
      deliveryWindow: order.delivery_window,
      weightLbs: order.weight_lbs,
      total: order.total,
      photoUrl: photo_url || undefined,
      trackingUrl,
    };

    if (action === 'pickup_complete') {
      // 1. Update order to picked_up
      await supabase
        .from('orders')
        .update({ status: 'picked_up', updated_at: new Date().toISOString() })
        .eq('id', order.id);

      // 2. Insert event
      await supabase.from('order_events').insert({
        order_id: order.id,
        status: 'picked_up',
        note: notes ? `Pickup confirmed: ${notes}` : 'Driver secured laundry bag from porch/concierge.',
        triggered_by: 'Driver Mobile PWA',
      });

      // 3. Save photo if provided
      if (photo_url) {
        await supabase.from('garment_photos').insert({
          order_id: order.id,
          photo_type: 'pickup_proof',
          photo_url,
          condition_notes: notes || 'Contactless pickup verification',
          captured_by: 'Driver (Route Stop)',
        });
      }

      // 4. Dispatch SMS/WhatsApp
      basePayload.stage = 'picked_up';
      await messagingService.dispatchStageNotification(basePayload);

      return NextResponse.json({ success: true, new_status: 'picked_up' });
    }

    if (action === 'out_for_delivery') {
      // 1. Update order to out_for_delivery
      await supabase
        .from('orders')
        .update({ status: 'out_for_delivery', updated_at: new Date().toISOString() })
        .eq('id', order.id);

      // 2. Insert event
      await supabase.from('order_events').insert({
        order_id: order.id,
        status: 'out_for_delivery',
        note: 'Driver loaded fresh garments for delivery route.',
        triggered_by: 'Driver Mobile PWA',
      });

      // 3. Dispatch SMS/WhatsApp
      basePayload.stage = 'out_for_delivery';
      await messagingService.dispatchStageNotification(basePayload);

      return NextResponse.json({ success: true, new_status: 'out_for_delivery' });
    }

    if (action === 'delivery_complete') {
      // 1. Update order to delivered
      await supabase
        .from('orders')
        .update({ status: 'delivered', updated_at: new Date().toISOString() })
        .eq('id', order.id);

      // 2. Insert event
      await supabase.from('order_events').insert({
        order_id: order.id,
        status: 'delivered',
        note: notes ? `Delivered: ${notes}` : 'Delivered fresh and hung at designated delivery spot.',
        triggered_by: 'Driver Mobile PWA',
      });

      // 3. Save photo if provided
      if (photo_url) {
        await supabase.from('garment_photos').insert({
          order_id: order.id,
          photo_type: 'delivery_proof',
          photo_url,
          condition_notes: notes || 'Delivery drop-off proof',
          captured_by: 'Driver (Route Stop)',
        });
      }

      // 4. Dispatch SMS/WhatsApp
      basePayload.stage = 'delivered';
      await messagingService.dispatchStageNotification(basePayload);

      return NextResponse.json({ success: true, new_status: 'delivered' });
    }

    return NextResponse.json({ error: 'Unknown driver action' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
