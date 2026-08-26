import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  if (!isSupabaseConfigured) {
    return NextResponse.json({ preferences: null });
  }

  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ preferences: null });
    }

    const supabase = createAdminClient();

    // 1. Find customer id
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .or(`auth_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();

    if (!customer) {
      return NextResponse.json({ preferences: null });
    }

    // 2. Fetch preferences
    const { data: prefs } = await supabase
      .from('customer_preferences')
      .select('*')
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

    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // 1. Find customer record
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .or(`auth_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();

    if (!customer) {
      return NextResponse.json({ error: 'Customer record not found' }, { status: 404 });
    }

    // 2. Upsert customer preferences
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
      .select('*')
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
