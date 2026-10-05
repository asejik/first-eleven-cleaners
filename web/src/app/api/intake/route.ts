import { NextResponse } from 'next/server';
import { z } from 'zod';
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
import { checkIntakeAllowed } from '@/lib/order-lifecycle';
import { texasDate, texasDayStartUtc } from '@/lib/texas-time';
import { runAfterResponse } from '@/lib/after-response';
import { reportError } from '@/lib/error-reporting';


const IntakeSchema = z.object({
  order_id: z.guid('A valid order_id is required'),
  weight_lbs: z.number({ message: 'Weight must be a number of pounds' }).min(0, 'Weight cannot be negative').max(500, 'Weight looks too high; please re-check the scale').default(0),
  dry_clean_items: z
    .array(
      z.object({
        garment_type: z.string().min(1).max(100),
        quantity: z.number().int().min(0).max(500),
        notes: z.string().max(500).optional(),
      })
    )
    .max(100)
    .default([]),
  photos: z
    .array(z.object({ photo_url: z.string().min(1), condition_notes: z.string().max(1000).optional() }))
    .max(20)
    .default([]),
  intake_notes: z.string().max(2000).default(''),
});

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Verify intake specialist or admin authorization
    const auth = await verifyApiAuth(['intake_staff', 'admin'], request);
    if (auth.errorResponse) return auth.errorResponse;

    const supabase = createAdminClient();

    // Only what the station shows, filtered and capped in SQL (PR-14): the queue of picked-up
    // bags, the 50 most recently inspected orders, and today's inspection count.
    const intakeSelect = `
        *,
        customer:customers(*),
        address:addresses(*),
        items:order_items(*),
        photos:garment_photos(*)
      `;
    const todayStart = texasDayStartUtc(texasDate()); // Dallas calendar day (PR-13)
    const [queueRes, historyRes, todayRes] = await Promise.all([
      supabase.from('orders').select(intakeSelect).eq('status', 'picked_up').order('created_at', { ascending: true }),
      supabase
        .from('orders')
        .select(intakeSelect)
        .in('status', ['weighed_itemized', 'in_cleaning', 'out_for_delivery', 'delivered'])
        .order('updated_at', { ascending: false })
        .limit(50),
      supabase
        .from('order_events')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'weighed_itemized')
        .gte('timestamp', todayStart),
    ]);

    if (queueRes.error || historyRes.error) {
      console.error('Intake GET error:', queueRes.error || historyRes.error);
      return NextResponse.json({ queue: [], intakeHistory: [], todayIntakeCount: 0 });
    }

    const queue = queueRes.data || [];
    const intakeHistory = historyRes.data || [];
    const todayIntakeCount = todayRes.count ?? 0;

    return NextResponse.json(await withSignedPhotoUrls({ queue, intakeHistory, todayIntakeCount }));
  } catch (err) {
    console.error('Intake API error:', err);
    return NextResponse.json({ queue: [], intakeHistory: [], todayIntakeCount: 0 }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyApiAuth(['intake_staff', 'admin'], request);
    if (auth.errorResponse) return auth.errorResponse;

    const parsed = IntakeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Please check the intake details.' },
        { status: 400 }
      );
    }
    const { order_id, weight_lbs, dry_clean_items, photos, intake_notes } = parsed.data;

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

    // Business rule: intake runs on a picked-up bag, or re-weighs a weighed order that
    // hasn't been charged yet. Never on paid, cancelled or delivered orders (PR-02).
    const intakeCheck = checkIntakeAllowed(order.status, order.payment_status);
    if (!intakeCheck.ok) {
      return NextResponse.json({ error: intakeCheck.error }, { status: order.status === 'booked' ? 400 : 409 });
    }

    // 2. Calculate Pricing
    // Wash & fold is billed only when laundry was actually weighed (15 lb minimum applies then).
    // A "Both" order that arrives with dry cleaning only is not charged for laundry (PR-03).
    let washFoldSubtotal = 0;
    if (weight_lbs > 0) {
      const billedWeight = Math.max(WASH_FOLD_MINIMUM_LBS, weight_lbs);
      washFoldSubtotal = Number((billedWeight * WASH_FOLD_PRICE_PER_LB).toFixed(2));
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

    if (washFoldSubtotal > 0) {
      orderItemsToInsert.push({
        order_id: order.id,
        garment_type: 'wash_fold',
        service_type: 'wash_fold',
        quantity: 1,
        unit_price: WASH_FOLD_PRICE_PER_LB,
        subtotal: washFoldSubtotal,
        notes: weight_lbs < WASH_FOLD_MINIMUM_LBS
          ? `${weight_lbs} lbs wash & fold laundry (${WASH_FOLD_MINIMUM_LBS} lb minimum)`
          : `${weight_lbs} lbs wash & fold laundry`,
      });
    }

    if (Array.isArray(dry_clean_items)) {
      dry_clean_items.forEach((item) => {
        const qty = item.quantity;
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
    let unsavedPhotoCount = 0;
    let savedPhotoUrls: string[] = [];
    if (Array.isArray(photos) && photos.length > 0) {
      const resolvedPhotos = await Promise.all(
        photos.map(async (p) => {
          const resolvedUrl = await resolveAndUploadPhotoUrl(p.photo_url, order.id, 'intake');
          if (!resolvedUrl) return null; // never store a raw data URL (PR-06)
          return {
            order_id: order.id,
            photo_type: 'intake',
            photo_url: resolvedUrl,
            condition_notes: p.condition_notes || intake_notes || 'Intake Passport Verification',
            captured_by: 'Plant Intake Specialist',
          };
        })
      );

      const photosToInsert = resolvedPhotos.filter((p): p is NonNullable<typeof p> => p !== null);
      unsavedPhotoCount = photos.length - photosToInsert.length;
      savedPhotoUrls = photosToInsert.map((p) => p.photo_url);
      if (photosToInsert.length > 0) {
        await supabase.from('garment_photos').insert(photosToInsert);
      }
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
            reportError('intake/payment-hold', failureReason, { alert: true, details: `Order ${order.order_number || order.id} is on Payment Hold` });
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

    const { data: updatedRows, error: updateErr } = await supabase
      .from('orders')
      .update({
        weight_lbs: weight_lbs || null,
        subtotal,
        express_surcharge: financials.expressSurcharge,
        discount_amount: financials.discountAmount,
        environmental_fee: financials.environmentalFee, // PR-15
        sales_tax: financials.salesTax,
        total: finalTotal,
        status: 'weighed_itemized',
        payment_status: paymentStatus,
        payment_id: paymentId,
        notes: effectiveNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .eq('status', order.status)
      .select('id');

    if (updateErr || !updatedRows || updatedRows.length === 0) {
      // The card may already have been charged above; the Square payment ID is in the logs and events
      console.error(`[Intake] Order ${order.id} changed during intake or could not be saved (payment ${paymentStatus}, ${paymentId}):`, updateErr);
      reportError('api/intake', updateErr || 'Order changed during intake', { alert: true, details: `Order ${order.order_number || order.id}: payment ${paymentStatus} ${paymentId || ''}; check Square before retrying` });
      return NextResponse.json(
        { error: 'This order changed while intake was running. Refresh the queue and check the order before retrying.' },
        { status: 409 }
      );
    }

    // 7. Log Timeline Events
    await supabase.from('order_events').insert({
      order_id: order.id,
      status: 'weighed_itemized',
      note: isPaymentFailed
        ? `Intake Complete: ${weight_lbs} lbs, ${orderItemsToInsert.filter((i) => i.service_type === 'dry_clean').length} dry clean lines itemized ($${subtotal.toFixed(2)}). ORDER ON PAYMENT HOLD: Card declined.`
        : `Intake Complete: ${weight_lbs} lbs, ${orderItemsToInsert.filter((i) => i.service_type === 'dry_clean').length} dry clean lines itemized. Subtotal: $${subtotal.toFixed(2)}. Ready for master eco-cleaning.`,
      triggered_by: intakeAuthor,
    });

    // 8. Dispatch Notification
    const wasAlreadyAdvanced = order.status === 'in_cleaning' || order.status === 'out_for_delivery' || order.status === 'delivered';

    if (!wasAlreadyAdvanced) {
      const rawCustomer = order.customer;
      const customer = (Array.isArray(rawCustomer) ? rawCustomer[0] : rawCustomer) as { full_name?: string; phone?: string; email?: string } | null;
      const origin = getAppBaseUrl();
      const primaryPhotoUrl = savedPhotoUrls[0];

      const customAlertText = isPaymentFailed
        ? `⚠️ First Eleven: Order #${order.order_number || order.id.slice(0, 8)} is weighed & itemized ($${finalTotal.toFixed(2)}), but your card was declined. Please pay securely here so we can start cleaning: ${origin}/track/${order.id}`
        : undefined;

      const payload: MessagePayload = {
        orderId: order.id,
        orderNumber: order.order_number || order.id.slice(0, 8),
        customerName: customer?.full_name || 'Valued Customer',
        customerPhone: customer?.phone || '',
        // No phone on file: email only, never a placeholder number (PR-22)
        ...(customer?.phone ? {} : { smsConsent: false }),
        customerEmail: customer?.email,
        stage: 'weighed_itemized',
        pickupDate: order.pickup_date,
        pickupWindow: order.pickup_window,
        deliveryDate: order.delivery_date,
        deliveryWindow: order.delivery_window,
        weightLbs: weight_lbs || null,
        itemCount: orderItemsToInsert.filter((i) => i.service_type === 'dry_clean').reduce((acc, i) => acc + i.quantity, 0),
        total: finalTotal,
        photoUrl: primaryPhotoUrl,
        trackingUrl: `${origin}/track/${order.id}`,
        customMessage: customAlertText,
      };

      runAfterResponse(() => messagingService.dispatchStageNotification(payload), 'intake notification');
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
      warning: [
        isPaymentFailed ? `Automatic card authorization failed ($${finalTotal.toFixed(2)}). Order is on Payment Hold.` : null,
        unsavedPhotoCount > 0 ? `${unsavedPhotoCount} photo(s) could not be saved. Please retake and re-upload them.` : null,
      ].filter(Boolean).join(' ') || undefined,
    });
  } catch (err: unknown) {
    console.error('Intake POST error:', err);
    return apiError('api/intake', err, 500);
  }
}
