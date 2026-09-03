import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedCustomer } from '@/lib/supabase/auth-helpers';

export async function GET(request: Request) {
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  if (!isSupabaseConfigured) {
    return NextResponse.json({ addresses: [] });
  }

  try {
    const { customer, user } = await getAuthenticatedCustomer(request);

    if (!user || !customer) {
      return NextResponse.json({ addresses: [] });
    }

    const supabase = createAdminClient();

    // Fetch customer addresses with explicit fields
    const { data: addresses, error } = await supabase
      .from('addresses')
      .select('id, customer_id, street, unit, city, state, zip, lat, lng, is_default, delivery_notes, zone_id, created_at')
      .eq('customer_id', customer.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch addresses:', error);
      return NextResponse.json({ addresses: [] });
    }

    return NextResponse.json({ addresses: addresses || [] });
  } catch (err) {
    console.error('Addresses GET error:', err);
    return NextResponse.json({ addresses: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { street, unit = null, city = 'Dallas', state = 'TX', zip, delivery_notes = null, is_default = false } = body;

    if (!street || !zip) {
      return NextResponse.json(
        { error: 'Street address and ZIP code are required.' },
        { status: 400 }
      );
    }

    const { customer, user } = await getAuthenticatedCustomer(request);

    if (!user || !customer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // 1. Check existing addresses count
    const { count } = await supabase
      .from('addresses')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customer.id);

    const shouldBeDefault = is_default || (count === 0);

    // 2. If new address is default, unset all others
    if (shouldBeDefault) {
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('customer_id', customer.id);
    }

    // 3. Insert new address
    const { data: newAddress, error: insertErr } = await supabase
      .from('addresses')
      .insert({
        customer_id: customer.id,
        street: street.trim(),
        unit: unit?.trim() || null,
        city: city.trim(),
        state: state.trim().toUpperCase(),
        zip: zip.trim(),
        delivery_notes: delivery_notes?.trim() || null,
        is_default: shouldBeDefault,
      })
      .select('id, customer_id, street, unit, city, state, zip, lat, lng, is_default, delivery_notes, zone_id, created_at')
      .single();

    if (insertErr) {
      console.error('Address insert error:', insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, address: newAddress });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { address_id, is_default } = body;

    if (!address_id) {
      return NextResponse.json({ error: 'address_id is required' }, { status: 400 });
    }

    const { customer, user } = await getAuthenticatedCustomer(request);

    if (!user || !customer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    if (is_default) {
      // Unset previous defaults
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('customer_id', customer.id);

      // Set target address as default
      const { data: updated, error } = await supabase
        .from('addresses')
        .update({ is_default: true })
        .eq('id', address_id)
        .eq('customer_id', customer.id)
        .select('id, customer_id, street, unit, city, state, zip, lat, lng, is_default, delivery_notes, zone_id, created_at')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, address: updated });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const addressId = searchParams.get('id');

    if (!addressId) {
      return NextResponse.json({ error: 'Address id parameter is required' }, { status: 400 });
    }

    const { customer, user } = await getAuthenticatedCustomer(request);

    if (!user || !customer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Check if target was default
    const { data: targetAddr } = await supabase
      .from('addresses')
      .select('is_default')
      .eq('id', addressId)
      .eq('customer_id', customer.id)
      .maybeSingle();

    const { error: deleteErr } = await supabase
      .from('addresses')
      .delete()
      .eq('id', addressId)
      .eq('customer_id', customer.id);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    // If deleted address was default, make the most recent remaining address default
    if (targetAddr?.is_default) {
      const { data: remaining } = await supabase
        .from('addresses')
        .select('id')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (remaining) {
        await supabase
          .from('addresses')
          .update({ is_default: true })
          .eq('id', remaining.id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
