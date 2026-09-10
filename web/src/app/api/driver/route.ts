import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { messagingService } from '@/lib/messaging';
import { resolveAndUploadPhotoUrl } from '@/lib/storage';
import { getAppBaseUrl } from '@/lib/constants';
import type { MessagePayload } from '@/lib/messaging/templates';


interface DriverContext {
  isDriverRole: boolean;
  isAdminRole: boolean;
  driverLabel: string;
  matchesDriver: (capturedBy?: string | null) => boolean;
}

function getDriverContext(auth: {
  customer: { id?: string; full_name?: string; email?: string; role?: string } | null;
  user: { id?: string; email?: string; user_metadata?: { full_name?: string; role?: string } } | null;
}): DriverContext {
  const isDriverRole = auth.customer?.role === 'driver' || auth.user?.user_metadata?.role === 'driver';
  const isAdminRole = auth.customer?.role === 'admin' || auth.user?.user_metadata?.role === 'admin';
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

  return { isDriverRole, isAdminRole, driverLabel, matchesDriver };
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await verifyApiAuth(['driver', 'admin'], request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const shift = searchParams.get('shift') || 'all'; // 'morning' | 'evening' | 'all'
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

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
          customer:customers(id, full_name, phone, email),
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
          customer:customers(id, full_name, phone, email),
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

    const allActive = activeOrders || [];
    const { isDriverRole, isAdminRole, matchesDriver } = getDriverContext(auth);

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

      // Check if already claimed / loaded into a driver's van
      const photos = (o.photos as Array<{ photo_type?: string; captured_by?: string }>) || [];
      const events = (o.events as Array<{ status?: string; triggered_by?: string }>) || [];
      const plantLoadPhotos = photos.filter((p) => p.photo_type === 'return' || p.photo_type === 'plant_pickup');
      const plantLoadPhoto = plantLoadPhotos.length > 0 ? plantLoadPhotos[plantLoadPhotos.length - 1] : null;
      const plantLoadEvents = events.filter((e) => e.status === 'out_for_delivery' && e.triggered_by && !e.triggered_by.includes('Mission Control'));
      const plantLoadEvent = plantLoadEvents.length > 0 ? plantLoadEvents[plantLoadEvents.length - 1] : null;

      const isClaimedByDriver = Boolean(plantLoadPhoto || plantLoadEvent);
      return !isClaimedByDriver;
    });

    // 4. Out on Delivery Route (Loaded into THIS driver's delivery van)
    const deliveries = allActive.filter((o) => {
      const isOutForDelivery = o.status === 'out_for_delivery';
      const matchShift = shift === 'all' || !o.delivery_window || o.delivery_window === shift;
      if (!isOutForDelivery || !matchShift) return false;

      const photos = (o.photos as Array<{ photo_type?: string; captured_by?: string }>) || [];
      const events = (o.events as Array<{ status?: string; triggered_by?: string }>) || [];
      const plantLoadPhotos = photos.filter((p) => p.photo_type === 'return' || p.photo_type === 'plant_pickup');
      const plantLoadPhoto = plantLoadPhotos.length > 0 ? plantLoadPhotos[plantLoadPhotos.length - 1] : null;
      const plantLoadEvents = events.filter((e) => e.status === 'out_for_delivery' && e.triggered_by && !e.triggered_by.includes('Mission Control'));
      const plantLoadEvent = plantLoadEvents.length > 0 ? plantLoadEvents[plantLoadEvents.length - 1] : null;

      const isClaimed = Boolean(plantLoadPhoto || plantLoadEvent);
      if (!isClaimed) return false;

      if (isDriverRole) {
        const capturedBy = ((plantLoadPhoto?.captured_by || '') + ' ' + (plantLoadEvent?.triggered_by || '')).toLowerCase();
        return matchesDriver(capturedBy);
      }

      return true;
    });

    // 2b. Picked Up Completed (Permanent record of customer pickups completed by THIS driver and transferred to the office/plant)
    const allCombined = [...(allActive || []), ...(completedOrders || [])];
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
    const completed = (completedOrders || []).filter((o) => {
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

    return NextResponse.json({
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
    });
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
    const { isDriverRole, isAdminRole, driverLabel, matchesDriver } = getDriverContext(auth);

    // Fetch order with customer, photos, and events (explicit columns)
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        pickup_date,
        pickup_window,
        delivery_date,
        delivery_window,
        weight_lbs,
        total,
        customer:customers(id, full_name, phone, email),
        photos:garment_photos(id, photo_type, captured_by),
        events:order_events(id, status, triggered_by)
      `)
      .eq('id', order_id)
      .maybeSingle();

    if (orderErr || !order) {
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
      customerPhone: customer?.phone || '+12145550199',
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
        triggered_by: driverLabel,
      });

      // 3. Resolve and upload photo to Supabase Storage CDN
      const resolvedPhotoUrl = await resolveAndUploadPhotoUrl(photo_url, order.id, 'pickup_proof');

      await supabase.from('garment_photos').insert({
        order_id: order.id,
        photo_type: 'pickup_proof',
        photo_url: resolvedPhotoUrl || photo_url,
        condition_notes: notes || 'Contactless pickup verification',
        captured_by: driverLabel,
      });

      // 4. Dispatch SMS/WhatsApp
      basePayload.stage = 'picked_up';
      basePayload.photoUrl = resolvedPhotoUrl || photo_url || undefined;
      await messagingService.dispatchStageNotification(basePayload);

      return NextResponse.json({ success: true, new_status: 'picked_up' });
    }

    // Step: Driver loads fresh garments from plant/office into delivery van
    if (action === 'load_for_delivery' || action === 'out_for_delivery') {
      // Business rule: Check if order is already claimed/loaded into another driver's van
      const existingEvents = (order.events as Array<{ status?: string; triggered_by?: string }>) || [];
      const existingPhotos = (order.photos as Array<{ photo_type?: string; captured_by?: string }>) || [];
      const plantLoadEvents = existingEvents.filter(
        (e) => e.status === 'out_for_delivery' && e.triggered_by && !e.triggered_by.includes('Mission Control')
      );
      const plantLoadEvent = plantLoadEvents.length > 0 ? plantLoadEvents[plantLoadEvents.length - 1] : null;
      const plantLoadPhotos = existingPhotos.filter(
        (p) => p.photo_type === 'return' || p.photo_type === 'plant_pickup'
      );
      const plantLoadPhoto = plantLoadPhotos.length > 0 ? plantLoadPhotos[plantLoadPhotos.length - 1] : null;

      if (plantLoadEvent || plantLoadPhoto) {
        const capturedBy = ((plantLoadPhoto?.captured_by || '') + ' ' + (plantLoadEvent?.triggered_by || '')).toLowerCase();
        if (!matchesDriver(capturedBy) && !isAdminRole) {
          return NextResponse.json(
            { error: 'This order has already been loaded into another driver\'s van.' },
            { status: 409 }
          );
        }
      }

      // 1. Update order to out_for_delivery
      await supabase
        .from('orders')
        .update({ status: 'out_for_delivery', updated_at: new Date().toISOString() })
        .eq('id', order.id);

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
        await supabase.from('garment_photos').insert({
          order_id: order.id,
          photo_type: 'return',
          photo_url: resolvedPhotoUrl || photo_url,
          condition_notes: notes || 'Loaded from plant for outbound delivery route',
          captured_by: driverLabel,
        });
      }

      // 4. Dispatch SMS/WhatsApp
      basePayload.stage = 'out_for_delivery';
      basePayload.photoUrl = resolvedPhotoUrl || undefined;
      await messagingService.dispatchStageNotification(basePayload);

      return NextResponse.json({ success: true, new_status: 'out_for_delivery' });
    }

    if (action === 'delivery_complete') {
      // Business rule: Only the driver whose van the order was loaded into (or admin) can confirm delivery
      if (isDriverRole && !isAdminRole) {
        const existingEvents = (order.events as Array<{ status?: string; triggered_by?: string }>) || [];
        const existingPhotos = (order.photos as Array<{ photo_type?: string; captured_by?: string }>) || [];
        const plantLoadEvents = existingEvents.filter(
          (e) => e.status === 'out_for_delivery' && e.triggered_by && !e.triggered_by.includes('Mission Control')
        );
        const plantLoadEvent = plantLoadEvents.length > 0 ? plantLoadEvents[plantLoadEvents.length - 1] : null;
        const plantLoadPhotos = existingPhotos.filter(
          (p) => p.photo_type === 'return' || p.photo_type === 'plant_pickup'
        );
        const plantLoadPhoto = plantLoadPhotos.length > 0 ? plantLoadPhotos[plantLoadPhotos.length - 1] : null;

        const capturedBy = ((plantLoadPhoto?.captured_by || '') + ' ' + (plantLoadEvent?.triggered_by || '')).toLowerCase();
        if (capturedBy && !matchesDriver(capturedBy)) {
          return NextResponse.json(
            { error: 'This order is assigned to another driver\'s van and cannot be confirmed by your account.' },
            { status: 403 }
          );
        }
      }

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
        triggered_by: driverLabel,
      });

      // 3. Resolve and upload photo to Supabase Storage CDN
      const resolvedPhotoUrl = await resolveAndUploadPhotoUrl(photo_url, order.id, 'delivery_proof');

      await supabase.from('garment_photos').insert({
        order_id: order.id,
        photo_type: 'delivery_proof',
        photo_url: resolvedPhotoUrl || photo_url,
        condition_notes: notes || 'Delivery drop-off proof',
        captured_by: driverLabel,
      });

      // 4. Dispatch SMS/WhatsApp
      basePayload.stage = 'delivered';
      basePayload.photoUrl = resolvedPhotoUrl || photo_url || undefined;
      await messagingService.dispatchStageNotification(basePayload);

      return NextResponse.json({ success: true, new_status: 'delivered' });
    }

    return NextResponse.json({ error: 'Unknown driver action' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
