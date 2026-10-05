import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { messagingService } from '@/lib/messaging';
import { resolveAndUploadPhotoUrl, withSignedPhotoUrls } from '@/lib/storage';
import { withStaffPreferences } from '@/lib/care-preferences';
import { getAppBaseUrl } from '@/lib/constants';
import { handleExpressDeliverySLA } from '@/lib/express';
import type { MessagePayload } from '@/lib/messaging/templates';
import { apiError } from '@/lib/api-errors';
import { texasDate } from '@/lib/texas-time';
import { runAfterResponse } from '@/lib/after-response';


interface DriverContext {
  isDriverRole: boolean;
  isAdminRole: boolean;
  driverLabel: string;
  /** customers.id of the signed-in driver (orders.assigned_driver_id) */
  driverCustomerId: string | null;
  matchesDriver: (capturedBy?: string | null) => boolean;
}

function getDriverContext(auth: {
  customer: { id?: string; full_name?: string; email?: string; role?: string } | null;
  user: { id?: string; email?: string; user_metadata?: { full_name?: string; role?: string } } | null;
}): DriverContext {
  const isDriverRole = auth.customer?.role === 'driver';
  const isAdminRole = auth.customer?.role === 'admin';
  const currentDriverName = (auth.customer?.full_name || auth.user?.user_metadata?.full_name || '').toLowerCase().trim();
  const driverId = (auth.customer?.id || auth.user?.id || '').toLowerCase().trim();
  const driverEmail = (auth.customer?.email || auth.user?.email || '').toLowerCase().trim();

  const driverDisplayName = (
    auth.customer?.full_name ||
    auth.user?.user_metadata?.full_name ||
    auth.user?.email?.split('@')[0] ||
    'Driver'
  ).trim();
  const rawId = auth.customer?.id || auth.user?.id || '';
  const driverLabel = `Driver (${driverDisplayName}${rawId ? ` [${rawId}]` : ''})`;

  const matchesDriver = (capturedBy?: string | null): boolean => {
    if (isAdminRole) return true;
    if (!capturedBy) return false;
    const normalized = capturedBy.toLowerCase();

    // 1. Exact or substring match on Driver UUID/ID
    if (driverId && normalized.includes(driverId)) return true;

    // 2. Match on Driver Full Name
    if (currentDriverName && normalized.includes(currentDriverName)) return true;

    // 3. Match on Driver First Name (at least 3 characters to prevent false collisions)
    if (currentDriverName) {
      const firstName = currentDriverName.split(/\s+/)[0];
      if (firstName && firstName.length >= 3 && normalized.includes(firstName)) return true;
    }

    // 4. Match on Driver Email
    if (driverEmail && normalized.includes(driverEmail)) return true;

    return false;
  };

  return { isDriverRole, isAdminRole, driverLabel, driverCustomerId: auth.customer?.id || null, matchesDriver };
}

/**
 * Whose van holds an out-for-delivery order (P03 PR-19). orders.assigned_driver_id is the
 * record; orders loaded before that column existed fall back to the old name match on the
 * load event/photo.
 */
function vanClaim(
  o: { assigned_driver_id?: string | null; photos?: unknown; events?: unknown },
  ctx: Pick<DriverContext, 'isAdminRole' | 'driverCustomerId' | 'matchesDriver'>
): { claimed: boolean; mine: boolean } {
  if (o.assigned_driver_id) {
    return { claimed: true, mine: ctx.isAdminRole || o.assigned_driver_id === ctx.driverCustomerId };
  }
  const photos = (o.photos as Array<{ photo_type?: string; captured_by?: string }>) || [];
  const events = (o.events as Array<{ status?: string; triggered_by?: string }>) || [];
  const loadPhoto = photos.filter((p) => p.photo_type === 'return' || p.photo_type === 'plant_pickup').pop();
  const loadEvent = events
    .filter((e) => e.status === 'out_for_delivery' && e.triggered_by && !e.triggered_by.includes('Mission Control'))
    .pop();
  if (!loadPhoto && !loadEvent) return { claimed: false, mine: false };
  const capturedBy = `${loadPhoto?.captured_by || ''} ${loadEvent?.triggered_by || ''}`.toLowerCase();
  return { claimed: true, mine: ctx.isAdminRole || ctx.matchesDriver(capturedBy) };
}

/** Conditional status change: applies only if the order is still in `expected` (PR-02). */
async function moveOrderStatus(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string,
  expected: string,
  next: string
): Promise<NextResponse | null> {
  const { data, error } = await supabase
    .from('orders')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', expected)
    .select('id');
  if (error) {
    console.error('Driver status update error:', error);
    return NextResponse.json({ error: 'Could not update this order. Please try again.' }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'This order was already updated. Refresh your manifest.' }, { status: 409 });
  }
  return null;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyApiAuth(['driver', 'admin'], request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const shift = searchParams.get('shift') || 'all'; // 'morning' | 'evening' | 'all'
  const date = searchParams.get('date') || texasDate();

  try {
    const supabase = createAdminClient();

    // 1. Fetch active driver stops and completed orders concurrently to cut DB latency
    const [
      { data: activeOrders, error: activeErr },
      { data: completedOrders, error: completedErr }
    ] = await Promise.all([
      supabase
        .from('orders')
        .select(`
          id,
          order_number,
          assigned_driver_id,
          customer_id,
          address_id,
          status,
          order_type,
          pickup_date,
          pickup_window,
          delivery_date,
          delivery_window,
          notes,
          created_at,
          customer:customers!customer_id(id, full_name, phone, email, preferences:customer_preferences(gate_code, delivery_instructions)),
          address:addresses(id, street, unit, city, state, zip, delivery_notes),
          photos:garment_photos(id, order_id, photo_type, photo_url, condition_notes, captured_by, captured_at),
          events:order_events(id, status, triggered_by, timestamp, note)
        `)
        .in('status', ['booked', 'picked_up', 'weighed_itemized', 'in_cleaning', 'out_for_delivery'])
        .order('created_at', { ascending: false }),
      supabase
        .from('orders')
        .select(`
          id,
          order_number,
          assigned_driver_id,
          customer_id,
          address_id,
          status,
          order_type,
          pickup_date,
          pickup_window,
          delivery_date,
          delivery_window,
          notes,
          created_at,
          updated_at,
          customer:customers!customer_id(id, full_name, phone, email, preferences:customer_preferences(gate_code, delivery_instructions)),
          address:addresses(id, street, unit, city, state, zip, delivery_notes),
          photos:garment_photos(id, order_id, photo_type, photo_url, condition_notes, captured_by, captured_at),
          events:order_events(id, status, triggered_by, timestamp, note)
        `)
        .eq('status', 'delivered')
        .order('updated_at', { ascending: false })
        .limit(25)
    ]);

    if (activeErr) {
      console.error('Driver GET active orders error:', activeErr);
    }
    if (completedErr) {
      console.error('Driver GET completed orders error:', completedErr);
    }

    // Gate code and delivery instructions from the customer's Preferences (P05 AR-03)
    const allActive = (activeOrders || []).map((o) => withStaffPreferences(o, 'driver'));
    const driverCtx = getDriverContext(auth);
    const { isDriverRole, isAdminRole, matchesDriver } = driverCtx;

    // 1. Customer Pickups Scheduled
    const pickups = allActive.filter((o) => {
      const matchStatus = o.status === 'booked';
      const matchShift = shift === 'all' || o.pickup_window === shift;
      return matchStatus && matchShift;
    });

    // 2. Bags in Van (Customer bags picked up by THIS specific driver, en route to plant)
    const pickedUpHistory = allActive.filter((o) => {
      const isPickedUp = o.status === 'picked_up';
      const matchShift = shift === 'all' || o.pickup_window === shift;
      if (!isPickedUp || !matchShift) return false;

      if (isDriverRole) {
        const photos = (o.photos as Array<{ photo_type?: string; captured_by?: string }>) || [];
        const events = (o.events as Array<{ status?: string; triggered_by?: string }>) || [];
        const pickupPhotos = photos.filter((p) => p.photo_type === 'pickup_proof');
        const pickupPhoto = pickupPhotos.length > 0 ? pickupPhotos[pickupPhotos.length - 1] : null;
        const pickupEvents = events.filter((e) => e.status === 'picked_up');
        const pickupEvent = pickupEvents.length > 0 ? pickupEvents[pickupEvents.length - 1] : null;
        const capturedBy = ((pickupPhoto?.captured_by || '') + ' ' + (pickupEvent?.triggered_by || '')).toLowerCase();

        return matchesDriver(capturedBy);
      }

      return true;
    });

    // 3. Ready at Plant / Office (Clean garments ready for delivery, waiting for a driver to load into van)
    // CRITICAL: An order is ONLY ready for delivery when cleaning is finished (status: 'out_for_delivery').
    // Orders in 'in_cleaning' or 'weighed_itemized' are actively in plant processing and must NEVER be shown to drivers.
    const readyAtPlant = allActive.filter((o) => {
      const isOutForDelivery = o.status === 'out_for_delivery';
      const matchShift = shift === 'all' || !o.delivery_window || o.delivery_window === shift;
      if (!isOutForDelivery || !matchShift) return false;

      // Not yet loaded into any van (PR-19)
      return !vanClaim(o, driverCtx).claimed;
    });

    // 4. Out on Delivery Route (Loaded into THIS driver's delivery van)
    const deliveries = allActive.filter((o) => {
      const isOutForDelivery = o.status === 'out_for_delivery';
      const matchShift = shift === 'all' || !o.delivery_window || o.delivery_window === shift;
      if (!isOutForDelivery || !matchShift) return false;

      // In this driver's van (admins see every loaded van) (PR-19)
      const claim = vanClaim(o, driverCtx);
      return claim.claimed && claim.mine;
    });

    // 2b. Picked Up Completed (Permanent record of customer pickups completed by THIS driver and transferred to the office/plant)
    const completedWithNotes = (completedOrders || []).map((o) => withStaffPreferences(o, 'driver'));
    const allCombined = [...(allActive || []), ...completedWithNotes];
    const pickedUpCompleted = allCombined.filter((o) => {
      if (o.status === 'booked') return false;
      const matchShift = shift === 'all' || o.pickup_window === shift;
      if (!matchShift) return false;

      if (isAdminRole) return true;

      if (isDriverRole) {
        const photos = (o.photos as Array<{ photo_type?: string; captured_by?: string }>) || [];
        const events = (o.events as Array<{ status?: string; triggered_by?: string }>) || [];
        const pickupPhotos = photos.filter((p) => p.photo_type === 'pickup_proof');
        const pickupPhoto = pickupPhotos.length > 0 ? pickupPhotos[pickupPhotos.length - 1] : null;
        const pickupEvents = events.filter((e) => e.status === 'picked_up');
        const pickupEvent = pickupEvents.length > 0 ? pickupEvents[pickupEvents.length - 1] : null;
        const capturedBy = ((pickupPhoto?.captured_by || '') + ' ' + (pickupEvent?.triggered_by || '')).toLowerCase();

        return matchesDriver(capturedBy);
      }

      return true;
    });

    // 5. Completed Drops
    const completed = completedWithNotes.filter((o) => {
      const matchShift = shift === 'all' || !o.delivery_window || o.delivery_window === shift;
      if (!matchShift) return false;

      if (isAdminRole) return true;

      if (isDriverRole) {
        const photos = (o.photos as Array<{ photo_type?: string; captured_by?: string }>) || [];
        const events = (o.events as Array<{ status?: string; triggered_by?: string }>) || [];
        const deliveryPhotos = photos.filter((p) => p.photo_type === 'delivery_proof');
        const deliveryPhoto = deliveryPhotos.length > 0 ? deliveryPhotos[deliveryPhotos.length - 1] : null;
        const deliveryEvents = events.filter((e) => e.status === 'delivered');
        const deliveryEvent = deliveryEvents.length > 0 ? deliveryEvents[deliveryEvents.length - 1] : null;
        const capturedBy = ((deliveryPhoto?.captured_by || '') + ' ' + (deliveryEvent?.triggered_by || '')).toLowerCase();

        return matchesDriver(capturedBy);
      }

      return true;
    });

    return NextResponse.json(await withSignedPhotoUrls({
      pickups,
      picked_up_history: pickedUpHistory,
      picked_up_completed: pickedUpCompleted,
      ready_at_plant: readyAtPlant,
      deliveries,
      completed,
      meta: {
        total_pickups: pickups.length,
        total_picked_up: pickedUpHistory.length,
        total_picked_up_completed: pickedUpCompleted.length,
        total_ready_at_plant: readyAtPlant.length,
        total_deliveries: deliveries.length,
        total_completed: completed.length,
        selected_shift: shift,
        date,
      },
    }));
  } catch (err) {
    console.error('Driver API error:', err);
    return NextResponse.json({ pickups: [], picked_up_history: [], picked_up_completed: [], ready_at_plant: [], deliveries: [], completed: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyApiAuth(['driver', 'admin'], request);
    if (auth.errorResponse) return auth.errorResponse;

    const body = await request.json();
    const { action, order_id, photo_url, notes = '' } = body;

    if (!action || !order_id) {
      return NextResponse.json({ error: 'action and order_id are required' }, { status: 400 });
    }

    // Business rule: Mandatory photo validation for pickup and delivery verification
    if (action === 'pickup_complete' || action === 'delivery_complete') {
      if (!photo_url || typeof photo_url !== 'string' || photo_url.trim().length === 0) {
        return NextResponse.json(
          {
            error:
              action === 'pickup_complete'
                ? 'A photo snapshot of the laundry bag at the pickup location is mandatory.'
                : 'A photo snapshot verifying contactless drop-off is mandatory.',
          },
          { status: 400 }
        );
      }
    }

    const supabase = createAdminClient();
    const { isDriverRole, isAdminRole, driverLabel, driverCustomerId, matchesDriver } = getDriverContext(auth);

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order_id.trim());

    // Fetch order with customer, photos, and events (explicit columns)
    const orderQuery = supabase
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        assigned_driver_id,
        express_tier,
        express_surcharge,
        express_auto_refunded,
        payment_status,
        payment_id,
        refunded_amount,
        subtotal,
        pickup_date,
        pickup_window,
        delivery_date,
        delivery_window,
        weight_lbs,
        total,
        customer:customers!customer_id(id, full_name, phone, email),
        photos:garment_photos(id, photo_type, captured_by),
        events:order_events(id, status, triggered_by)
      `);

    const { data: order, error: orderErr } = isUUID
      ? await orderQuery.eq('id', order_id.trim()).maybeSingle()
      : await orderQuery.or(`order_number.eq.${order_id.trim()},id.eq.${order_id.trim()}`).maybeSingle();

    if (orderErr) {
      console.error('Driver POST order fetch DB error:', orderErr);
      return NextResponse.json({ error: `Database error: ${orderErr.message}` }, { status: 500 });
    }

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const rawCustomer = order.customer;
    const customer = (Array.isArray(rawCustomer) ? rawCustomer[0] : rawCustomer) as { full_name?: string; phone?: string; email?: string } | null;
    const origin = getAppBaseUrl();
    const trackingUrl = `${origin}/track/${order.id}`;

    const basePayload: MessagePayload = {
      orderId: order.id,
      orderNumber: order.order_number || order.id.slice(0, 8),
      customerName: customer?.full_name || 'Valued Customer',
      customerPhone: customer?.phone || '',
      // No phone on file: email only, never a placeholder number (PR-22)
      ...(customer?.phone ? {} : { smsConsent: false }),
      customerEmail: customer?.email,
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
      if (order.status !== 'booked') {
        return NextResponse.json(
          { error: 'This order has already been picked up.' },
          { status: 409 }
        );
      }

      // 1. Save the mandatory proof photo first: no photo, no status change (PR-06)
      const resolvedPhotoUrl = await resolveAndUploadPhotoUrl(photo_url, order.id, 'pickup_proof');
      if (!resolvedPhotoUrl) {
        return NextResponse.json(
          { error: 'The proof photo could not be saved. Please retake it and try again.' },
          { status: 502 }
        );
      }

      // 2. Update order to picked_up
      const pickupBlocked = await moveOrderStatus(supabase, order.id, 'booked', 'picked_up');
      if (pickupBlocked) return pickupBlocked;

      // 2. Insert event
      await supabase.from('order_events').insert({
        order_id: order.id,
        status: 'picked_up',
        note: notes ? `Pickup confirmed: ${notes}` : 'Driver secured laundry bag from porch/concierge.',
        triggered_by: driverLabel,
      });

      // 3. Record the proof photo
      await supabase.from('garment_photos').insert({
        order_id: order.id,
        photo_type: 'pickup_proof',
        photo_url: resolvedPhotoUrl,
        condition_notes: notes || 'Contactless pickup verification',
        captured_by: driverLabel,
      });

      // 4. Dispatch SMS/WhatsApp
      basePayload.stage = 'picked_up';
      basePayload.photoUrl = resolvedPhotoUrl;
      const notifyPayload = { ...basePayload };
      runAfterResponse(() => messagingService.dispatchStageNotification(notifyPayload), `driver ${notifyPayload.stage} notification`);

      return NextResponse.json({ success: true, new_status: 'picked_up' });
    }

    // Step: Driver loads fresh garments from plant/office into delivery van
    if (action === 'load_for_delivery' || action === 'out_for_delivery') {
      // Only cleaned orders released by the plant (Out for Delivery) can be loaded (PR-02)
      if (order.status !== 'out_for_delivery') {
        return NextResponse.json(
          { error: 'This order is not ready for delivery yet. Only orders released from the plant can be loaded.' },
          { status: 409 }
        );
      }

      // Business rule: an order rides in one van. Claim it with a single conditional update so
      // two drivers loading at once can't both get it (PR-19).
      const driverCtx = { isAdminRole, driverCustomerId, matchesDriver };
      const claim = vanClaim(order, driverCtx);
      if (claim.claimed && !claim.mine) {
        return NextResponse.json(
          { error: 'This order has already been loaded into another driver\'s van.' },
          { status: 409 }
        );
      }
      if (!driverCustomerId) {
        return NextResponse.json({ error: 'Your staff profile could not be found. Please sign in again.' }, { status: 403 });
      }
      const { data: claimedRows, error: claimErr } = await supabase
        .from('orders')
        .update({ assigned_driver_id: driverCustomerId, updated_at: new Date().toISOString() })
        .eq('id', order.id)
        .eq('status', 'out_for_delivery')
        .or(`assigned_driver_id.is.null,assigned_driver_id.eq.${driverCustomerId}`)
        .select('id');
      if (claimErr) {
        console.error('Driver van claim error:', claimErr);
        return NextResponse.json({ error: 'Could not load this order. Please try again.' }, { status: 500 });
      }
      if (!claimedRows || claimedRows.length === 0) {
        return NextResponse.json(
          { error: 'This order has already been loaded into another driver\'s van.' },
          { status: 409 }
        );
      }

      // 2. Insert event recording who loaded it from office
      await supabase.from('order_events').insert({
        order_id: order.id,
        status: 'out_for_delivery',
        note: notes ? `Loaded for delivery: ${notes}` : `${driverLabel} collected fresh garments from plant and loaded into delivery van.`,
        triggered_by: driverLabel,
      });

      // 3. Save plant loading record if photo was provided (no fake stock photo)
      let resolvedPhotoUrl: string | null = null;
      if (photo_url && typeof photo_url === 'string' && photo_url.trim()) {
        resolvedPhotoUrl = await resolveAndUploadPhotoUrl(photo_url, order.id, 'return');
      }
      if (resolvedPhotoUrl) {
        await supabase.from('garment_photos').insert({
          order_id: order.id,
          photo_type: 'return',
          photo_url: resolvedPhotoUrl,
          condition_notes: notes || 'Loaded from plant for outbound delivery route',
          captured_by: driverLabel,
        });
      }

      // 4. Dispatch SMS/WhatsApp
      basePayload.stage = 'out_for_delivery';
      basePayload.photoUrl = resolvedPhotoUrl || undefined;
      const notifyPayload = { ...basePayload };
      runAfterResponse(() => messagingService.dispatchStageNotification(notifyPayload), `driver ${notifyPayload.stage} notification`);

      return NextResponse.json({ success: true, new_status: 'out_for_delivery' });
    }

    if (action === 'delivery_complete') {
      if (order.status !== 'out_for_delivery') {
        return NextResponse.json(
          { error: 'Only orders that are out for delivery can be marked delivered.' },
          { status: 409 }
        );
      }

      // Business rule: only the driver whose van holds the order (or an admin) confirms delivery (PR-19)
      if (isDriverRole && !isAdminRole) {
        const claim = vanClaim(order, { isAdminRole, driverCustomerId, matchesDriver });
        if (claim.claimed && !claim.mine) {
          return NextResponse.json(
            { error: 'This order is assigned to another driver\'s van and cannot be confirmed by your account.' },
            { status: 403 }
          );
        }
      }

      // 1. Save the mandatory proof photo first: no photo, no status change (PR-06)
      const resolvedPhotoUrl = await resolveAndUploadPhotoUrl(photo_url, order.id, 'delivery_proof');
      if (!resolvedPhotoUrl) {
        return NextResponse.json(
          { error: 'The proof photo could not be saved. Please retake it and try again.' },
          { status: 502 }
        );
      }

      // 2. Update order to delivered
      const deliveryBlocked = await moveOrderStatus(supabase, order.id, 'out_for_delivery', 'delivered');
      if (deliveryBlocked) return deliveryBlocked;

      // 2. Insert event
      await supabase.from('order_events').insert({
        order_id: order.id,
        status: 'delivered',
        note: notes ? `Delivered: ${notes}` : 'Delivered fresh and hung at designated delivery spot.',
        triggered_by: driverLabel,
      });

      // 3. Record the proof photo
      await supabase.from('garment_photos').insert({
        order_id: order.id,
        photo_type: 'delivery_proof',
        photo_url: resolvedPhotoUrl,
        condition_notes: notes || 'Delivery drop-off proof',
        captured_by: driverLabel,
      });

      // 4. Dispatch SMS/WhatsApp
      basePayload.stage = 'delivered';
      basePayload.photoUrl = resolvedPhotoUrl;
      const notifyPayload = { ...basePayload };
      runAfterResponse(() => messagingService.dispatchStageNotification(notifyPayload), `driver ${notifyPayload.stage} notification`);

      // 5. Check 24-Hour Express SLA (Delivered by 10:00 AM on delivery date)
      const expressSLAResult = await handleExpressDeliverySLA(order, new Date());

      return NextResponse.json({
        success: true,
        new_status: 'delivered',
        express_sla: expressSLAResult,
      });
    }

    return NextResponse.json({ error: 'Unknown driver action' }, { status: 400 });
  } catch (err: unknown) {
    return apiError('api/driver', err, 500);
  }
}
