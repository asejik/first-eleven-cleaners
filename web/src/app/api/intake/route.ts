import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { messagingService } from '@/lib/messaging';
import {
  WASH_FOLD_PRICE_PER_LB,
  WASH_FOLD_MINIMUM_LBS,
  DRY_CLEAN_PRICES,
  PROMO_CODE_LAUNCH,
  PROMO_DISCOUNT_PERCENT,
  calculateOrderFinancials,
  getAppBaseUrl,
} from '@/lib/constants';
import { getSquareConfig, chargeCardOnFile } from '@/lib/square';
import { resolveAndUploadPhotoUrl, withSignedPhotoUrls } from '@/lib/storage';
import type { MessagePayload } from '@/lib/messaging/templates';
import { apiError } from '@/lib/api-errors';


export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Verify intake specialist or admin authorization
    const auth = await verifyApiAuth(['intake_staff', 'admin'], request);
    if (auth.errorResponse) return auth.errorResponse;

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

    // Queue of bags ready for intake at the plant (must have been picked up by a driver)
    const queue = (orders || []).filter((o) => o.status === 'picked_up');

    // Orders that have completed intake inspection
    const intakeHistory = (orders || []).filter(
      (o) => o.status === 'weighed_itemized' || o.status === 'in_cleaning' || o.status === 'out_for_delivery' || o.status === 'delivered'
    );

    const todayStr = new Date().toISOString().split('T')[0];
    const todayIntakeCount = intakeHistory.filter((o) => o.updated_at && o.updated_at.startsWith(todayStr)).length;

    return NextResponse.json(await withSignedPhotoUrls({ queue, intakeHistory, todayIntakeCount, allOrders: orders || [] }));
  } catch (err) {
    console.error('Intake API error:', err);
    return NextResponse.json({ queue: [], intakeHistory: [], todayIntakeCount: 0 }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyApiAuth(['intake_staff', 'admin'], request);
    if (auth.errorResponse) return auth.errorResponse;

    const body = await request.json();
    const {
      order_id,
      weight_lbs = 0,
      dry_clean_items = [],
      photos = [],
      intake_notes = '',
    } = body;

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Fetch current order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        order_type,
        status,
        pickup_date,
        pickup_window,
        delivery_date,
        delivery_window,
        weight_lbs,
        discount_amount,
        express_tier,
        promo_code,
        payment_status,
        payment_id,
        square_customer_id,
        square_card_id,
        notes,
        customer:customers(id, full_name, phone, email)
      `)
      .eq('id', order_id)
      .maybeSingle();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Business rule: Intake inspection requires driver to have picked up the bag
    if (order.status === 'booked') {
      return NextResponse.json(
        { error: 'Cannot process intake: Bag has not been picked up yet. Driver must complete pickup first.' },
        { status: 400 }
      );
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
          const unitPrice = priceMeta ? priceMeta.price : 8.99;
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

    // Final total uses the same rules as booking (SEC-06): Express surcharge, promo and
    // recurring-plan discounts as percentages of the weighed subtotal, environmental fee, tax.
    let promoDiscountPercent = 0;
    let promoDiscountAmount: number | undefined;
    if (order.promo_code === PROMO_CODE_LAUNCH) {
      promoDiscountPercent = PROMO_DISCOUNT_PERCENT;
    } else if (order.promo_code) {
      const { data: promoRow } = await supabase
        .from('promo_codes')
        .select('discount_type, discount_value')
        .eq('code', order.promo_code)
        .maybeSingle();
      if (promoRow?.discount_type === 'fixed') {
        promoDiscountAmount = Number(promoRow.discount_value) || 0;
      } else if (promoRow) {
        promoDiscountPercent = Number(promoRow.discount_value) || 0;
      }
    }
    // Booking records the recurring plan in the order notes ("Recurring Plan: Weekly | Bi-Weekly")
    const frequency = order.notes?.includes('Recurring Plan: Bi-Weekly')
      ? 'biweekly'
      : order.notes?.includes('Recurring Plan: Weekly')
        ? 'weekly'
        : 'one_time';

    const financials = calculateOrderFinancials({
      subtotal,
      isExpress: order.express_tier === 'express_24hr',
      discountPercent: promoDiscountPercent,
      discountAmount: promoDiscountAmount,
      frequency,
    });
    const finalTotal = financials.finalTotal;

    // 3. Clear old items and insert fresh itemized breakdown
    await supabase.from('order_items').delete().eq('order_id', order.id);
    if (orderItemsToInsert.length > 0) {
      await supabase.from('order_items').insert(orderItemsToInsert);
    }

    // 4. Insert Garment Photos (Resolving base64 to Supabase Storage CDN)
    if (Array.isArray(photos) && photos.length > 0) {
      const photosToInsert = await Promise.all(
        photos.map(async (p: { photo_url: string; condition_notes?: string }) => {
          const resolvedUrl = await resolveAndUploadPhotoUrl(p.photo_url, order.id, 'intake');
          return {
            order_id: order.id,
            photo_type: 'intake',
            photo_url: resolvedUrl || p.photo_url,
            condition_notes: p.condition_notes || intake_notes || 'Intake Passport Verification',
            captured_by: 'Plant Intake Specialist',
          };
        })
      );

      await supabase.from('garment_photos').insert(photosToInsert);
    }

    // 5. Automatic Payment Capture on Card on File
    let paymentStatus = order.payment_status || 'authorized';
    let paymentId = order.payment_id;

    if (finalTotal > 0 && (paymentStatus === 'authorized' || paymentStatus === 'pending')) {
      const squareConfig = getSquareConfig();
      let failureReason = '';

      if (squareConfig.isLive) {
        // Charge the card saved at booking (SEC-06). Never fall back to a test token.
        if (order.square_customer_id && order.square_card_id) {
          const charge = await chargeCardOnFile(squareConfig, {
            squareCustomerId: order.square_customer_id,
            cardId: order.square_card_id,
            amount: finalTotal,
            orderId: order.id,
            orderNumber: order.order_number || order.id.slice(0, 8),
          });
          if (charge.ok && charge.status === 'COMPLETED') {
            paymentStatus = 'charged';
            paymentId = charge.paymentId;
          } else {
            failureReason = charge.ok ? `Square payment status ${charge.status}` : charge.error;
            console.error('Square card-on-file charge declined in intake:', failureReason);
            paymentStatus = 'failed';
          }
        } else {
          failureReason = 'No card on file for this order';
          paymentStatus = 'failed';
        }
      }

      // In live production or when Square is configured, never simulate a charge
      if (squareConfig.isLive) {
        if (paymentStatus === 'charged') {
          // Log payment charge audit event
          await supabase.from('order_events').insert({
            order_id: order.id,
            status: 'charged',
            note: `Payment of $${finalTotal.toFixed(2)} captured on card on file via Square. (Transaction ID: ${paymentId})`,
            triggered_by: 'Square Web Payments (Intake Auto-Charge)',
          });
        } else {
          paymentStatus = 'failed';
          await supabase.from('order_events').insert({
            order_id: order.id,
            status: 'payment_failed',
            note: `Automatic payment of $${finalTotal.toFixed(2)} failed on card on file (${failureReason}). Order placed on Payment Hold.`,
            triggered_by: 'Square Web Payments (Intake Auto-Charge)',
          });
        }
      } else if (process.env.NODE_ENV !== 'production') {
        // Fallback for local development environments only
        paymentStatus = 'charged';
        paymentId = paymentId && paymentId.startsWith('sq_txn_') ? paymentId : `sq_txn_${crypto.randomUUID().slice(0, 10)}`;
        await supabase.from('order_events').insert({
          order_id: order.id,
          status: 'charged',
          note: `[DEV SIMULATION] Payment of $${finalTotal.toFixed(2)} simulated. (Transaction ID: ${paymentId})`,
          triggered_by: 'Square Web Payments (Intake Dev Simulator)',
        });
      }
    }

    const isPaymentFailed = paymentStatus === 'failed';

    // 6. Update Order Record with weighed & itemized data + payment status
    const intakeAuthor = auth.customer?.full_name ? `Central Intake (${auth.customer.full_name})` : 'Central Intake Station';
    const effectiveNotes = isPaymentFailed
      ? `[PAYMENT HOLD: Card authorization declined for $${finalTotal.toFixed(2)}] ${intake_notes || order.notes || ''}`.trim()
      : (intake_notes || order.notes);

    await supabase
      .from('orders')
      .update({
        weight_lbs: Number(weight_lbs) || null,
        subtotal,
        express_surcharge: financials.expressSurcharge,
        discount_amount: financials.discountAmount,
        total: finalTotal,
        status: 'weighed_itemized',
        payment_status: paymentStatus,
        payment_id: paymentId,
        notes: effectiveNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    // 7. Log Timeline Events
    await supabase.from('order_events').insert({
      order_id: order.id,
      status: 'weighed_itemized',
      note: isPaymentFailed
        ? `Intake Complete: ${weight_lbs} lbs, ${orderItemsToInsert.length} dry clean lines itemized ($${subtotal.toFixed(2)}). ORDER ON PAYMENT HOLD: Card declined.`
        : `Intake Complete: ${weight_lbs} lbs, ${orderItemsToInsert.length} dry clean lines itemized. Subtotal: $${subtotal.toFixed(2)}. Ready for master eco-cleaning.`,
      triggered_by: intakeAuthor,
    });

    // 8. Dispatch Notification
    const wasAlreadyAdvanced = order.status === 'in_cleaning' || order.status === 'out_for_delivery' || order.status === 'delivered';

    if (!wasAlreadyAdvanced) {
      const rawCustomer = order.customer;
      const customer = (Array.isArray(rawCustomer) ? rawCustomer[0] : rawCustomer) as { full_name?: string; phone?: string; email?: string } | null;
      const origin = getAppBaseUrl();
      const primaryPhotoUrl = photos?.[0]?.photo_url;

      const customAlertText = isPaymentFailed
        ? `⚠️ First Eleven: Order #${order.order_number || order.id.slice(0, 8)} is weighed & itemized ($${finalTotal.toFixed(2)}), but card authorization failed. Please update your payment method here to start cleaning: ${origin}/dashboard/billing`
        : undefined;

      const payload: MessagePayload = {
        orderId: order.id,
        orderNumber: order.order_number || order.id.slice(0, 8),
        customerName: customer?.full_name || 'Valued Customer',
        customerPhone: customer?.phone || '+12145550199',
        customerEmail: customer?.email,
        stage: 'weighed_itemized',
        pickupDate: order.pickup_date,
        pickupWindow: order.pickup_window,
        deliveryDate: order.delivery_date,
        deliveryWindow: order.delivery_window,
        weightLbs: Number(weight_lbs) || null,
        itemCount: orderItemsToInsert.reduce((acc, i) => acc + i.quantity, 0),
        total: finalTotal,
        photoUrl: primaryPhotoUrl,
        trackingUrl: isPaymentFailed ? `${origin}/dashboard/billing` : `${origin}/track/${order.id}`,
        customMessage: customAlertText,
      };

      await messagingService.dispatchStageNotification(payload);
    }

    return NextResponse.json({
      success: true,
      order_id: order.id,
      status: 'weighed_itemized',
      payment_status: paymentStatus,
      payment_failed: isPaymentFailed,
      payment_id: paymentId,
      subtotal,
      total: finalTotal,
      warning: isPaymentFailed
        ? `Automatic card authorization failed ($${finalTotal.toFixed(2)}). Order is on Payment Hold.`
        : undefined,
    });
  } catch (err: unknown) {
    console.error('Intake POST error:', err);
    return apiError('api/intake', err, 500);
  }
}
