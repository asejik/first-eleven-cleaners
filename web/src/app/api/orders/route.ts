import { NextResponse } from 'next/server';
import type { Order } from '@/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedCustomer } from '@/lib/supabase/auth-helpers';

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  if (isSupabaseConfigured) {
    try {
      const { customer, user } = await getAuthenticatedCustomer(request);

      if (!user || !customer) {
        return NextResponse.json({
          orders: [],
          total_count: 0,
          page,
          limit,
          total_pages: 0,
        });
      }

      const supabase = createAdminClient();

      // Fetch customer's orders with exact pagination and selective column projections
      const { data: orders, count, error } = await supabase
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
          weight_lbs,
          subtotal,
          express_tier,
          promo_code,
          discount_amount,
          total,
          payment_id,
          payment_status,
          notes,
          created_at,
          updated_at,
          items:order_items(id, order_id, garment_type, service_type, quantity, unit_price, subtotal, notes),
          events:order_events(id, order_id, status, timestamp, note, triggered_by),
          photos:garment_photos(id, order_id, photo_type, photo_url, condition_notes, captured_by, captured_at),
          address:addresses(id, street, unit, city, state, zip, delivery_notes)
        `, { count: 'exact' })
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Supabase orders query error:', error);
        return NextResponse.json({ orders: [], total_count: 0, page, limit, total_pages: 0 });
      }

      const totalCount = count ?? (orders?.length || 0);

      return NextResponse.json({
        orders: orders || [],
        total_count: totalCount,
        page,
        limit,
        total_pages: Math.ceil(totalCount / limit),
      });
    } catch (err) {
      console.error('Supabase get orders error:', err);
      return NextResponse.json({ orders: [], total_count: 0, page, limit, total_pages: 0 });
    }
  }

  const paginatedMocks = MOCK_ORDERS.slice(offset, offset + limit);
  return NextResponse.json({
    orders: paginatedMocks,
    total_count: MOCK_ORDERS.length,
    page,
    limit,
    total_pages: Math.ceil(MOCK_ORDERS.length / limit),
  });
}
