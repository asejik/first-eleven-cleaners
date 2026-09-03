import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedCustomer } from '@/lib/supabase/auth-helpers';

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
    const { customer } = await getAuthenticatedCustomer(request);
    const supabase = createAdminClient();

    let query = supabase
      .from('claims')
      .select(`
        id,
        order_id,
        customer_id,
        issue_type,
        description,
        photo_urls,
        status,
        resolution_notes,
        created_at,
        updated_at,
        order:orders(id, order_number, pickup_date, total, status)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

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
    } else if (customer) {
      query = query.eq('customer_id', customer.id);
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
      const { customer, user } = await getAuthenticatedCustomer(request);
      if (!user || !customer) {
        return NextResponse.json(
          { error: 'Unauthorized: You must be logged in to submit a claim.' },
          { status: 401 }
        );
      }

      const supabase = createAdminClient();

      // 1. Resolve Order ID & verify ownership
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order_id);

      const { data: orderRow } = isUUID
        ? await supabase.from('orders').select('id, customer_id, status').eq('id', order_id).maybeSingle()
        : await supabase.from('orders').select('id, customer_id, status').eq('order_number', order_id).maybeSingle();

      if (!orderRow) {
        return NextResponse.json(
          { error: 'Could not find a matching order to attach this claim to.' },
          { status: 404 }
        );
      }

      // IDOR Guard: User can only claim against their own order, unless admin
      if (orderRow.customer_id !== customer.id && customer.role !== 'admin') {
        return NextResponse.json(
          { error: 'Forbidden: You can only submit claims for your own orders.' },
          { status: 403 }
        );
      }

      const resolvedOrderId = orderRow.id;
      const resolvedCustomerId = orderRow.customer_id;
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
        .select('id, order_id, customer_id, issue_type, description, photo_urls, status, created_at')
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
        status: orderRow.status,
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
