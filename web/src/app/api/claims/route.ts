import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Maps incoming form values to exact PostgreSQL check constraint: ('damage', 'lost_item', 'quality', 'wrong_item', 'other')
function normalizeIssueType(type: string): 'damage' | 'lost_item' | 'quality' | 'wrong_item' | 'other' {
  switch (type) {
    case 'quality':
    case 'quality_issue':
      return 'quality';
    case 'damage':
    case 'garment_damage':
      return 'damage';
    case 'missing_item':
    case 'lost_item':
      return 'lost_item';
    case 'wrong_item':
      return 'wrong_item';
    default:
      return 'other';
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('order_id');

  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  if (!isSupabaseConfigured) {
    return NextResponse.json({ claims: [] });
  }

  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    const supabase = createAdminClient();

    let query = supabase
      .from('claims')
      .select(`
        *,
        order:orders(id, order_number, pickup_date, total, status)
      `)
      .order('created_at', { ascending: false });

    if (orderId) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
      if (isUUID) {
        query = query.eq('order_id', orderId);
      } else {
        const { data: matchedOrder } = await supabase
          .from('orders')
          .select('id')
          .eq('order_number', orderId)
          .maybeSingle();

        if (matchedOrder) {
          query = query.eq('order_id', matchedOrder.id);
        } else {
          return NextResponse.json({ claims: [] });
        }
      }
    } else if (user) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .or(`auth_id.eq.${user.id},email.eq.${user.email}`)
        .maybeSingle();

      if (customer) {
        query = query.eq('customer_id', customer.id);
      }
    }

    const { data: claims, error } = await query;

    if (error) {
      console.error('Failed to fetch claims:', error);
      return NextResponse.json({ claims: [] });
    }

    return NextResponse.json({ claims: claims || [] });
  } catch (err) {
    console.error('Claims GET error:', err);
    return NextResponse.json({ claims: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { order_id, issue_type, description, photo_urls = [] } = body;

    if (!order_id || !issue_type || !description) {
      return NextResponse.json(
        { error: 'Missing required claim parameters.' },
        { status: 400 }
      );
    }

    const isSupabaseConfigured =
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

    if (isSupabaseConfigured) {
      const authClient = await createClient();
      const {
        data: { user },
      } = await authClient.auth.getUser();

      const supabase = createAdminClient();

      // 1. Resolve Order ID & Customer ID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order_id);
      let resolvedOrderId = order_id;
      let resolvedCustomerId: string | null = null;

      const { data: orderRow } = isUUID
        ? await supabase.from('orders').select('id, customer_id').eq('id', order_id).maybeSingle()
        : await supabase.from('orders').select('id, customer_id').eq('order_number', order_id).maybeSingle();

      if (orderRow) {
        resolvedOrderId = orderRow.id;
        resolvedCustomerId = orderRow.customer_id;
      }

      if (!resolvedCustomerId && user) {
        const { data: cust } = await supabase
          .from('customers')
          .select('id')
          .or(`auth_id.eq.${user.id},email.eq.${user.email}`)
          .maybeSingle();
        if (cust) resolvedCustomerId = cust.id;
      }

      if (!resolvedOrderId || !resolvedCustomerId) {
        return NextResponse.json(
          { error: 'Could not find a matching order to attach this claim to.' },
          { status: 400 }
        );
      }

      const validIssueType = normalizeIssueType(issue_type);

      const { data: insertedClaim, error: claimErr } = await supabase
        .from('claims')
        .insert({
          order_id: resolvedOrderId,
          customer_id: resolvedCustomerId,
          issue_type: validIssueType,
          description: description.trim(),
          photo_urls: photo_urls || [],
          status: 'open',
        })
        .select('*')
        .single();

      if (claimErr) {
        console.error('Supabase claim insert error:', claimErr);
        return NextResponse.json(
          { error: `Database error: ${claimErr.message}` },
          { status: 500 }
        );
      }

      // Log event in order timeline
      await supabase.from('order_events').insert({
        order_id: resolvedOrderId,
        status: 'in_cleaning',
        note: `Make It Right claim #${insertedClaim.id.slice(0, 8)} logged (${validIssueType}).`,
        triggered_by: 'Customer (Make It Right)',
      });

      return NextResponse.json({
        success: true,
        claim: insertedClaim,
        claim_id: insertedClaim.id,
        status: 'open',
        message:
          'Your claim has been opened with highest priority under our Refund-First policy. A member of our executive resolution team will reach out within 2 business hours.',
      });
    }

    // Fallback response if Supabase is offline
    const fallbackId = `clm_${crypto.randomUUID().slice(0, 8)}`;
    return NextResponse.json({
      success: true,
      claim_id: fallbackId,
      status: 'open',
      message:
        'Your claim has been opened with highest priority under our Refund-First policy. A member of our executive resolution team will reach out within 2 business hours.',
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
