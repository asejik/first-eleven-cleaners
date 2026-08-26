import { NextResponse } from 'next/server';
import type { Order } from '@/types';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Mock sample orders for instant testing & visual verification
const MOCK_ORDERS: Order[] = [
  {
    id: 'ord_sample_001',
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
    items: [
      {
        id: 'item_1',
        order_id: 'ord_sample_001',
        garment_type: 'suit_jacket',
        service_type: 'dry_clean',
        quantity: 2,
        unit_price: 14.97,
        subtotal: 29.94,
        notes: 'Navy wool suits',
      },
      {
        id: 'item_2',
        order_id: 'ord_sample_001',
        garment_type: 'pants_skirt',
        service_type: 'dry_clean',
        quantity: 2,
        unit_price: 8.97,
        subtotal: 17.94,
        notes: 'Matching suit trousers',
      },
      {
        id: 'item_3',
        order_id: 'ord_sample_001',
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
        order_id: 'ord_sample_001',
        status: 'booked',
        timestamp: '2026-08-18T19:20:00Z',
        note: 'Pickup scheduled for Aug 19 (7:30 - 10:00 AM)',
        triggered_by: 'system',
      },
      {
        id: 'ev_2',
        order_id: 'ord_sample_001',
        status: 'picked_up',
        timestamp: '2026-08-19T08:45:00Z',
        note: 'Driver picked up garments from front porch',
        triggered_by: 'Driver (Marcus T.)',
      },
      {
        id: 'ev_3',
        order_id: 'ord_sample_001',
        status: 'weighed_itemized',
        timestamp: '2026-08-19T10:15:00Z',
        note: 'Intake verified: 18.5 lbs Wash & Fold + 4 dry-clean pieces. Photos logged.',
        triggered_by: 'Intake Lead (Elena R.)',
      },
      {
        id: 'ev_4',
        order_id: 'ord_sample_001',
        status: 'in_cleaning',
        timestamp: '2026-08-19T14:30:00Z',
        note: 'Garments undergoing eco-friendly solvent cleaning & steam pressing',
        triggered_by: 'Plant Operations',
      },
    ],
    photos: [
      {
        id: 'photo_1',
        order_id: 'ord_sample_001',
        order_item_id: 'item_1',
        photo_type: 'intake',
        photo_url: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&auto=format&fit=crop&q=80',
        condition_notes: 'Intake verified: No tears or missing buttons. Minor lapel creasing logged.',
        captured_by: 'Elena R.',
        captured_at: '2026-08-19T10:12:00Z',
      },
      {
        id: 'photo_2',
        order_id: 'ord_sample_001',
        order_item_id: 'item_3',
        photo_type: 'intake',
        photo_url: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=600&auto=format&fit=crop&q=80',
        condition_notes: 'Weighed on calibrated scale: 18.5 lbs net.',
        captured_by: 'Elena R.',
        captured_at: '2026-08-19T10:14:00Z',
      },
    ],
  },
  {
    id: 'ord_sample_002',
    customer_id: 'c0000000-0000-0000-0000-000000000001',
    address_id: 'a0000000-0000-0000-0000-000000000001',
    status: 'delivered',
    order_type: 'dry_clean',
    pickup_date: '2026-08-12',
    pickup_window: 'morning',
    delivery_date: '2026-08-14',
    delivery_window: 'morning',
    weight_lbs: null,
    subtotal: 58.85,
    express_tier: 'standard',
    promo_code: null,
    discount_amount: 0,
    total: 58.85,
    payment_id: 'sq_tok_4242',
    payment_status: 'charged',
    notes: 'Executive suits for conference',
    created_at: '2026-08-12T07:00:00Z',
    updated_at: '2026-08-14T09:15:00Z',
    photos: [
      {
        id: 'photo_del_1',
        order_id: 'ord_sample_002',
        order_item_id: null,
        photo_type: 'delivery_proof',
        photo_url: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=600&auto=format&fit=crop&q=80',
        condition_notes: 'Delivered in First Eleven garment bags at front door.',
        captured_by: 'Driver (Marcus T.)',
        captured_at: '2026-08-14T09:12:00Z',
      },
    ],
  },
];

export async function GET() {
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  if (isSupabaseConfigured) {
    try {
      const authClient = await createClient();
      const {
        data: { user },
      } = await authClient.auth.getUser();

      if (!user) {
        return NextResponse.json({ orders: [], total_count: 0 });
      }

      const supabase = createAdminClient();

      // 1. Find customer record for this user
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .or(`auth_id.eq.${user.id},email.eq.${user.email}`)
        .maybeSingle();

      if (!customer) {
        return NextResponse.json({ orders: [], total_count: 0 });
      }

      // 2. Fetch customer's real orders with related items, events, and photos
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          *,
          items:order_items(*),
          events:order_events(*),
          photos:garment_photos(*),
          address:addresses(*)
        `)
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase orders query error:', error);
        return NextResponse.json({ orders: [], total_count: 0 });
      }

      return NextResponse.json({
        orders: orders || [],
        total_count: orders?.length || 0,
      });
    } catch (err) {
      console.error('Supabase get orders error:', err);
      return NextResponse.json({ orders: [], total_count: 0 });
    }
  }

  return NextResponse.json({
    orders: MOCK_ORDERS,
    total_count: MOCK_ORDERS.length,
  });
}
