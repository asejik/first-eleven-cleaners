import { NextResponse } from 'next/server';
import type { Order } from '@/types';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
