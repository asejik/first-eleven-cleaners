import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { messagingService } from '@/lib/messaging';
import { WASH_FOLD_PRICE_PER_LB, WASH_FOLD_MINIMUM_LBS, DRY_CLEAN_PRICES } from '@/lib/constants';
import type { MessagePayload } from '@/lib/messaging/templates';

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Fetch orders ready for intake inspection or recently in plant
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        *,
        customer:customers(*),
        address:addresses(*),
        items:order_items(*),
        photos:garment_photos(*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Intake GET error:', error);
      return NextResponse.json({ queue: [], allOrders: [] });
    }

    // Queue of bags waiting for intake
    const queue = (orders || []).filter(
      (o) => o.status === 'picked_up' || o.status === 'booked' || o.status === 'weighed_itemized'
    );

    return NextResponse.json({ queue, allOrders: orders || [] });
  } catch (err) {
    console.error('Intake API error:', err);
    return NextResponse.json({ queue: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      order_id,
      weight_lbs = 0,
      dry_clean_items = [],
      photos = [],
      advance_to_cleaning = false,
      intake_notes = '',
    } = body;

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Fetch current order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*, customer:customers(*)')
      .eq('id', order_id)
      .maybeSingle();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 2. Calculate Pricing
    let washFoldSubtotal = 0;
    if (weight_lbs > 0 || order.order_type === 'wash_fold' || order.order_type === 'mixed') {
      const billedWeight = Math.max(WASH_FOLD_MINIMUM_LBS, Number(weight_lbs) || 0);
      washFoldSubtotal = billedWeight * WASH_FOLD_PRICE_PER_LB;
    }

    let dryCleanSubtotal = 0;
    const orderItemsToInsert: Array<{
      order_id: string;
      garment_type: string;
      service_type: 'dry_clean' | 'wash_fold';
      quantity: number;
      unit_price: number;
      subtotal: number;
      notes?: string;
    }> = [];

    if (Array.isArray(dry_clean_items)) {
      dry_clean_items.forEach((item: { garment_type: string; quantity: number; notes?: string }) => {
        const qty = Number(item.quantity) || 0;
        if (qty > 0) {
          const priceMeta = DRY_CLEAN_PRICES[item.garment_type];
          const unitPrice = priceMeta ? priceMeta.price : 8.97;
          const itemSubtotal = qty * unitPrice;
          dryCleanSubtotal += itemSubtotal;

          orderItemsToInsert.push({
            order_id: order.id,
            garment_type: priceMeta ? priceMeta.label : item.garment_type,
            service_type: 'dry_clean',
            quantity: qty,
            unit_price: unitPrice,
            subtotal: itemSubtotal,
            notes: item.notes || undefined,
          });
        }
      });
    }

    const subtotal = Number((washFoldSubtotal + dryCleanSubtotal).toFixed(2));
    const discountAmount = Number(order.discount_amount || 0);
    const finalTotal = Math.max(0, Number((subtotal - discountAmount).toFixed(2)));

    // 3. Clear old items and insert fresh itemized breakdown
    await supabase.from('order_items').delete().eq('order_id', order.id);
    if (orderItemsToInsert.length > 0) {
      await supabase.from('order_items').insert(orderItemsToInsert);
    }

    // 4. Insert Garment Photos
    if (Array.isArray(photos) && photos.length > 0) {
      const photosToInsert = photos.map((p: { photo_url: string; condition_notes?: string }) => ({
        order_id: order.id,
        photo_type: 'intake',
        photo_url: p.photo_url,
        condition_notes: p.condition_notes || intake_notes || 'Intake Passport Verification',
        captured_by: 'Plant Intake Specialist',
      }));

      await supabase.from('garment_photos').insert(photosToInsert);
    }

    // 5. Update Order Record
    const nextStatus = advance_to_cleaning ? 'in_cleaning' : 'weighed_itemized';
    await supabase
      .from('orders')
      .update({
        weight_lbs: Number(weight_lbs) || null,
        subtotal,
        total: finalTotal,
        status: nextStatus,
        notes: intake_notes || order.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    // 6. Log Timeline Events
    await supabase.from('order_events').insert({
      order_id: order.id,
      status: 'weighed_itemized',
      note: `Intake Complete: ${weight_lbs} lbs, ${orderItemsToInsert.length} dry clean lines itemized. Subtotal: $${subtotal.toFixed(2)}.`,
      triggered_by: 'Central Intake Station',
    });

    if (advance_to_cleaning) {
      await supabase.from('order_events').insert({
        order_id: order.id,
        status: 'in_cleaning',
        note: 'Garments moved into master eco-cleaning and hand pressing line.',
        triggered_by: 'Plant Manager',
      });
    }

    // 7. Dispatch "Weighed & Itemized" Notification only if first time advancing
    const wasAlreadyAdvanced = order.status === 'in_cleaning' || order.status === 'out_for_delivery' || order.status === 'delivered';

    if (!wasAlreadyAdvanced) {
      const customer = order.customer as { full_name?: string; phone?: string } | null;
      const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const primaryPhotoUrl = photos?.[0]?.photo_url;

      const payload: MessagePayload = {
        orderId: order.id,
        orderNumber: order.order_number || order.id.slice(0, 8),
        customerName: customer?.full_name || 'Valued Customer',
        customerPhone: customer?.phone || '+12145550199',
        stage: nextStatus,
        pickupDate: order.pickup_date,
        pickupWindow: order.pickup_window,
        deliveryDate: order.delivery_date,
        deliveryWindow: order.delivery_window,
        weightLbs: Number(weight_lbs) || null,
        itemCount: orderItemsToInsert.reduce((acc, i) => acc + i.quantity, 0),
        total: finalTotal,
        photoUrl: primaryPhotoUrl,
        trackingUrl: `${origin}/track/${order.id}`,
      };

      await messagingService.dispatchStageNotification(payload);
    }

    return NextResponse.json({
      success: true,
      order_id: order.id,
      status: nextStatus,
      subtotal,
      total: finalTotal,
    });
  } catch (err: unknown) {
    console.error('Intake POST error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
