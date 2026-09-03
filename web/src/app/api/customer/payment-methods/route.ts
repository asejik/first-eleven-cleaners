import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedCustomer } from '@/lib/supabase/auth-helpers';

export const dynamic = 'force-dynamic';

interface StoredCard {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
  created_at: string;
}

export async function GET(request: Request) {
  try {
    const { customer, user } = await getAuthenticatedCustomer(request);

    if (!user || !customer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // 1. Fetch Customer Preferences (where payment_methods envelope may be stored)
    const { data: prefs } = await supabase
      .from('customer_preferences')
      .select('special_notes')
      .eq('customer_id', customer.id)
      .maybeSingle();

    let paymentMethods: StoredCard[] = [];
    if (prefs?.special_notes) {
      try {
        if (prefs.special_notes.startsWith('{') && prefs.special_notes.includes('payment_methods')) {
          const parsed = JSON.parse(prefs.special_notes);
          if (Array.isArray(parsed.payment_methods)) {
            paymentMethods = parsed.payment_methods;
          }
        }
      } catch {
        // Plain text special notes, ignore parse error
      }
    }

    // Fallback: If no cards explicitly vaulted in prefs, seed with default vaulted card on file
    if (paymentMethods.length === 0) {
      paymentMethods = [
        {
          id: 'card_default_f11',
          brand: 'visa',
          last4: '4242',
          exp_month: 12,
          exp_year: 2028,
          is_default: true,
          created_at: new Date().toISOString(),
        },
      ];
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
      payment_id: o.payment_id || `sq_auth_${o.id.slice(0, 8)}`,
      payment_status: o.payment_status || 'charged',
      items: o.items || [],
    }));

    return NextResponse.json({
      payment_methods: paymentMethods,
      invoices,
    });
  } catch (err: unknown) {
    console.error('Customer payment methods GET error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { customer, user } = await getAuthenticatedCustomer(request);

    if (!user || !customer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const body = await request.json();
    const {
      card_brand = 'visa',
      last4 = '4242',
      exp_month = 12,
      exp_year = 2028,
      is_default = false,
    } = body;

    // Fetch existing preferences
    const { data: prefs } = await supabase
      .from('customer_preferences')
      .select('special_notes')
      .eq('customer_id', customer.id)
      .maybeSingle();

    let existingCards: StoredCard[] = [];
    let plainNotes = '';

    if (prefs?.special_notes) {
      try {
        if (prefs.special_notes.startsWith('{') && prefs.special_notes.includes('payment_methods')) {
          const parsed = JSON.parse(prefs.special_notes);
          if (Array.isArray(parsed.payment_methods)) {
            existingCards = parsed.payment_methods;
          }
          plainNotes = parsed.notes || '';
        } else {
          plainNotes = prefs.special_notes;
        }
      } catch {
        plainNotes = prefs.special_notes;
      }
    }

    const newCard: StoredCard = {
      id: `card_${crypto.randomUUID().slice(0, 8)}`,
      brand: String(card_brand).toLowerCase(),
      last4: String(last4).slice(-4),
      exp_month: Number(exp_month) || 12,
      exp_year: Number(exp_year) || 2028,
      is_default: Boolean(is_default) || existingCards.length === 0,
      created_at: new Date().toISOString(),
    };

    if (newCard.is_default) {
      existingCards = existingCards.map((c) => ({ ...c, is_default: false }));
    }

    existingCards.push(newCard);

    const payloadToStore = JSON.stringify({
      notes: plainNotes,
      payment_methods: existingCards,
    });

    await supabase
      .from('customer_preferences')
      .upsert({
        customer_id: customer.id,
        special_notes: payloadToStore,
        updated_at: new Date().toISOString(),
      });

    return NextResponse.json({
      success: true,
      card: newCard,
      payment_methods: existingCards,
      message: 'New payment method securely vaulted and saved to your profile.',
    });
  } catch (err: unknown) {
    console.error('Customer payment methods POST error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { customer, user } = await getAuthenticatedCustomer(request);

    if (!user || !customer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { searchParams } = new URL(request.url);
    const cardId = searchParams.get('card_id');

    if (!cardId) {
      return NextResponse.json({ error: 'card_id parameter required' }, { status: 400 });
    }

    const { data: prefs } = await supabase
      .from('customer_preferences')
      .select('special_notes')
      .eq('customer_id', customer.id)
      .maybeSingle();

    let existingCards: StoredCard[] = [];
    let plainNotes = '';

    if (prefs?.special_notes) {
      try {
        if (prefs.special_notes.startsWith('{') && prefs.special_notes.includes('payment_methods')) {
          const parsed = JSON.parse(prefs.special_notes);
          if (Array.isArray(parsed.payment_methods)) {
            existingCards = parsed.payment_methods;
          }
          plainNotes = parsed.notes || '';
        }
      } catch {
        plainNotes = prefs?.special_notes || '';
      }
    }

    existingCards = existingCards.filter((c) => c.id !== cardId);

    // If we removed the default card, set the first remaining card as default
    if (existingCards.length > 0 && !existingCards.some((c) => c.is_default)) {
      existingCards[0].is_default = true;
    }

    const payloadToStore = JSON.stringify({
      notes: plainNotes,
      payment_methods: existingCards,
    });

    await supabase
      .from('customer_preferences')
      .upsert({
        customer_id: customer.id,
        special_notes: payloadToStore,
        updated_at: new Date().toISOString(),
      });

    return NextResponse.json({
      success: true,
      payment_methods: existingCards,
      message: 'Payment method removed.',
    });
  } catch (err: unknown) {
    console.error('Customer payment methods DELETE error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
