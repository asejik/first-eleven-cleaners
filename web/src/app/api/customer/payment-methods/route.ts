import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedCustomer } from '@/lib/supabase/auth-helpers';
import { apiError } from '@/lib/api-errors';
import { getSquareConfig, listCustomerCards, disableCard } from '@/lib/square';

export const dynamic = 'force-dynamic';

/**
 * Saved cards are the real cards on file with Square, created at booking (SEC-21).
 * There is no fake default card and no way to type a card number into our own pages.
 */
async function loadSquareCustomerId(customerId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('customers')
    .select('square_customer_id')
    .eq('id', customerId)
    .maybeSingle();
  return data?.square_customer_id || null;
}

export async function GET(request: Request) {
  try {
    const { customer, user } = await getAuthenticatedCustomer(request);

    if (!user || !customer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // 1. Real saved cards from Square (empty when none are on file or Square isn't configured)
    let paymentMethods: Array<{ id: string; brand: string; last4: string; exp_month: number; exp_year: number }> = [];
    const squareConfig = getSquareConfig();
    const squareCustomerId = await loadSquareCustomerId(customer.id);
    if (squareConfig.isLive && squareCustomerId) {
      const listed = await listCustomerCards(squareConfig, squareCustomerId);
      if (listed.ok) {
        // Each booking saves its own copy of the card; show one entry per physical card
        const seen = new Set<string>();
        paymentMethods = listed.cards
          .filter((card) => !seen.has(card.fingerprint) && seen.add(card.fingerprint))
          .map(({ id, brand, last4, exp_month, exp_year }) => ({ id, brand, last4, exp_month, exp_year }));
      } else {
        console.warn('Could not list Square cards for billing page:', listed.error);
      }
    }

    // 2. Fetch Invoices & Transaction History from Orders
    const { data: orders } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        order_type,
        weight_lbs,
        subtotal,
        discount_amount,
        total,
        payment_id,
        payment_status,
        created_at,
        updated_at,
        items:order_items(id, garment_type, service_type, quantity, unit_price, subtotal)
      `)
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false });

    const invoices = (orders || []).map((o) => ({
      id: o.id,
      order_number: o.order_number || o.id.slice(0, 8),
      date: o.updated_at || o.created_at,
      order_type: o.order_type,
      weight_lbs: o.weight_lbs,
      subtotal: Number(o.subtotal || 0),
      discount_amount: Number(o.discount_amount || 0),
      total: Number(o.total || 0),
      payment_id: o.payment_id || null,
      payment_status: o.payment_status || 'pending',
      items: o.items || [],
    }));

    return NextResponse.json({
      payment_methods: paymentMethods,
      invoices,
    });
  } catch (err: unknown) {
    return apiError('api/customer/payment-methods', err, 500);
  }
}

export async function POST() {
  // Cards are only added through Square's secure card form at checkout (SEC-21)
  return NextResponse.json(
    { error: 'Cards are saved securely through Square when you book a pickup.' },
    { status: 410 }
  );
}

export async function DELETE(request: Request) {
  try {
    const { customer, user } = await getAuthenticatedCustomer(request);
    if (!user || !customer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cardId = searchParams.get('card_id');
    if (!cardId) {
      return NextResponse.json({ error: 'card_id parameter required' }, { status: 400 });
    }

    const squareConfig = getSquareConfig();
    const squareCustomerId = await loadSquareCustomerId(customer.id);
    if (!squareConfig.isLive || !squareCustomerId) {
      return NextResponse.json({ error: 'Card not found.' }, { status: 404 });
    }

    // The card must belong to this customer; removing it removes every saved copy of it
    const listed = await listCustomerCards(squareConfig, squareCustomerId);
    const target = listed.ok ? listed.cards.find((card) => card.id === cardId) : undefined;
    if (!listed.ok || !target) {
      return NextResponse.json({ error: 'Card not found.' }, { status: 404 });
    }
    const copyIds = listed.cards.filter((card) => card.fingerprint === target.fingerprint).map((card) => card.id);

    // Keep cards that an unpaid order will be charged to at intake
    const supabase = createAdminClient();
    const { count: pendingOrders } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customer.id)
      .in('square_card_id', copyIds)
      .in('payment_status', ['authorized', 'pending'])
      .neq('status', 'cancelled');
    if ((pendingOrders ?? 0) > 0) {
      return NextResponse.json(
        { error: 'This card is still needed for an order that hasn\'t been charged yet. You can remove it once that order is paid.' },
        { status: 409 }
      );
    }

    for (const id of copyIds) {
      const disabled = await disableCard(squareConfig, id);
      if (!disabled.ok) {
        return apiError('api/customer/payment-methods DELETE', disabled.error, 502);
      }
    }

    return NextResponse.json({ success: true, message: 'Card removed.' });
  } catch (err: unknown) {
    return apiError('api/customer/payment-methods DELETE', err, 500);
  }
}
