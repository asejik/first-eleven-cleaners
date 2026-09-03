import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedCustomer } from '@/lib/supabase/auth-helpers';

export async function GET(request: Request) {
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  if (!isSupabaseConfigured) {
    return NextResponse.json({ preferences: null });
  }

  try {
    const { customer, user } = await getAuthenticatedCustomer(request);

    if (!user || !customer) {
      return NextResponse.json({ preferences: null });
    }

    const supabase = createAdminClient();

    // Fetch preferences with explicit columns
    const { data: prefs } = await supabase
      .from('customer_preferences')
      .select('customer_id, starch_level, fold_vs_hang, detergent_sensitivity, gate_code, delivery_instructions, special_notes, updated_at')
      .eq('customer_id', customer.id)
      .maybeSingle();

    return NextResponse.json({ preferences: prefs || null });
  } catch (err) {
    console.error('Failed to get preferences:', err);
    return NextResponse.json({ preferences: null }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  if (!isSupabaseConfigured) {
    return NextResponse.json({ success: true });
  }

  try {
    const body = await request.json();
    const {
      starch_level = 'none',
      fold_vs_hang = 'hang',
      detergent_sensitivity = null,
      gate_code = null,
      delivery_instructions = null,
      special_notes = null,
    } = body;

    const { customer, user } = await getAuthenticatedCustomer(request);

    if (!user || !customer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Upsert customer preferences
    const payload = {
      customer_id: customer.id,
      starch_level,
      fold_vs_hang,
      detergent_sensitivity: detergent_sensitivity?.trim() || null,
      gate_code: gate_code?.trim() || null,
      delivery_instructions: delivery_instructions?.trim() || null,
      special_notes: special_notes?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data: savedPrefs, error } = await supabase
      .from('customer_preferences')
      .upsert(payload, { onConflict: 'customer_id' })
      .select('customer_id, starch_level, fold_vs_hang, detergent_sensitivity, gate_code, delivery_instructions, special_notes, updated_at')
      .single();

    if (error) {
      console.error('Preferences save error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, preferences: savedPrefs });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
