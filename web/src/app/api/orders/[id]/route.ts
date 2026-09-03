import { NextResponse } from 'next/server';
import type { Order } from '@/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedCustomer } from '@/lib/supabase/auth-helpers';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const clientIp = getClientIp(request);
  const rateCheck = checkRateLimit(`order_detail:${clientIp}`, 60, 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many order lookups from this network. Please wait a minute.' },
      { status: 429 }
    );
  }

  const { id } = await params;

  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  if (isSupabaseConfigured) {
    try {
      const supabase = createAdminClient();

      // Check if query is UUID or order_number format (e.g. F11-2026-XXXX)
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      const query = supabase
        .from('orders')
        .select(`
          *,
          items:order_items(*),
          events:order_events(*),
          photos:garment_photos(*),
          address:addresses(*)
        `);

      const { data: dbOrder, error } = isUUID
        ? await query.eq('id', id).maybeSingle()
        : await query.or(`order_number.eq.${id},id.eq.${id}`).maybeSingle();

      if (!error && dbOrder) {
        return NextResponse.json({ order: dbOrder });
      }
    } catch (err) {
      console.error('Supabase get order detail error:', err);
    }
  }

  // Mock comprehensive order for single order tracker view
  const order: Order = {
    id,
    customer_id: 'c0000000-0000-0000-0000-000000000001',
    address_id: 'a0000000-0000-0000-0000-000000000001',
    status: 'in_cleaning',
    order_type: 'mixed',
    pickup_date: '2026-08-19',
    pickup_window: 'morning',
    delivery_date: '2026-08-21',
    delivery_window: 'evening',
    weight_lbs: 18.5,
    subtotal: 97.38,
    express_tier: 'standard',
    promo_code: 'KICKOFF15',
    discount_amount: 14.61,
    total: 82.77,
    payment_id: 'sq_tok_4242',
    payment_status: 'charged',
    notes: 'Please hang the dress shirts, fold the rest.',
    created_at: '2026-08-19T08:15:00Z',
    updated_at: '2026-08-19T14:30:00Z',
    address: {
      id: 'a0000000-0000-0000-0000-000000000001',
      customer_id: 'c0000000-0000-0000-0000-000000000001',
      street: '4514 Travis St',
      unit: 'Apt 304',
      city: 'Dallas',
      state: 'TX',
      zip: '75205',
      lat: 32.825,
      lng: -96.795,
      is_default: true,
      delivery_notes: 'Leave on porch behind planter',
      zone_id: '11111111-1111-1111-1111-111111111104',
    },
    items: [
      {
        id: 'item_1',
        order_id: id,
        garment_type: 'suit_jacket',
        service_type: 'dry_clean',
        quantity: 2,
        unit_price: 14.97,
        subtotal: 29.94,
        notes: 'Navy wool suits',
      },
      {
        id: 'item_2',
        order_id: id,
        garment_type: 'pants_skirt',
        service_type: 'dry_clean',
        quantity: 2,
        unit_price: 8.97,
        subtotal: 17.94,
        notes: 'Matching suit trousers',
      },
      {
        id: 'item_3',
        order_id: id,
        garment_type: 'wash_fold',
        service_type: 'wash_fold',
        quantity: 1,
        unit_price: 3.00,
        subtotal: 55.50,
        notes: '18.5 lbs everyday laundry',
      },
    ],
    events: [
      {
        id: 'ev_1',
        order_id: id,
        status: 'booked',
        timestamp: '2026-08-18T19:20:00Z',
        note: 'Pickup scheduled for Aug 19 (7:30 - 10:00 AM)',
        triggered_by: 'system',
      },
      {
        id: 'ev_2',
        order_id: id,
        status: 'picked_up',
        timestamp: '2026-08-19T08:45:00Z',
        note: 'Driver picked up garments from front porch',
        triggered_by: 'Driver (Marcus T.)',
      },
      {
        id: 'ev_3',
        order_id: id,
        status: 'weighed_itemized',
        timestamp: '2026-08-19T10:15:00Z',
        note: 'Intake verified: 18.5 lbs Wash & Fold + 4 dry-clean pieces. Photos logged.',
        triggered_by: 'Intake Lead (Elena R.)',
      },
      {
        id: 'ev_4',
        order_id: id,
        status: 'in_cleaning',
        timestamp: '2026-08-19T14:30:00Z',
        note: 'Garments undergoing eco-friendly solvent cleaning & steam pressing',
        triggered_by: 'Plant Operations',
      },
    ],
    photos: [
      {
        id: 'photo_1',
        order_id: id,
        order_item_id: 'item_1',
        photo_type: 'intake',
        photo_url: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&auto=format&fit=crop&q=80',
        condition_notes: 'Intake verified: No tears or missing buttons. Minor lapel creasing logged.',
        captured_by: 'Elena R.',
        captured_at: '2026-08-19T10:12:00Z',
      },
      {
        id: 'photo_2',
        order_id: id,
        order_item_id: 'item_3',
        photo_type: 'intake',
        photo_url: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=600&auto=format&fit=crop&q=80',
        condition_notes: 'Weighed on calibrated scale: 18.5 lbs net.',
        captured_by: 'Elena R.',
        captured_at: '2026-08-19T10:14:00Z',
      },
    ],
  };

  return NextResponse.json({ order });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (action !== 'cancel') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const { customer, user } = await getAuthenticatedCustomer(request);
    if (!user || !customer) {
      return NextResponse.json({ error: 'Unauthorized: Please log in to cancel this order.' }, { status: 401 });
    }

    const isSupabaseConfigured =
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

    if (isSupabaseConfigured) {
      const supabase = createAdminClient();

      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const query = supabase.from('orders').select('id, customer_id, status, order_number');
      const { data: order, error } = isUUID
        ? await query.eq('id', id).maybeSingle()
        : await query.or(`order_number.eq.${id},id.eq.${id}`).maybeSingle();

      if (error || !order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      // IDOR check: Only owner or admin can cancel
      if (order.customer_id !== customer.id && customer.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden: You can only cancel your own orders.' }, { status: 403 });
      }

      // Only allow cancellation if status is 'booked'
      if (order.status !== 'booked') {
        return NextResponse.json(
          { error: 'Pickups can only be cancelled before a driver is dispatched or pickup has occurred.' },
          { status: 400 }
        );
      }

      // Update order status to 'cancelled'
      const { data: updatedOrder, error: updateErr } = await supabase
        .from('orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', order.id)
        .select()
        .single();

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      // Record event
      await supabase.from('order_events').insert({
        order_id: order.id,
        status: 'cancelled',
        note: 'Pickup cancelled by customer.',
        triggered_by: customer.full_name || 'Customer',
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json({ success: true, order: updatedOrder, message: 'Pickup cancelled successfully.' });
    }

    // Mock mode response
    return NextResponse.json({
      success: true,
      order: { id, status: 'cancelled' },
      message: 'Pickup cancelled successfully.',
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
