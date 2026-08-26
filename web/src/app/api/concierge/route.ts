import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAIEngine } from '@/lib/ai';
import type { AIConversationMessage, ConciergeContext } from '@/lib/ai/types';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, history = [], customer_id } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const cookieStore = await cookies();
    const ssrSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ycxdryyhkdiuktkdtjwb.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljeGRyeXloa2RpdWt0a2R0andiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0Nzc5ODEsImV4cCI6MjEwMzA1Mzk4MX0.fGjD8lR3GfVpL9l105mR237qN0W0L6F7V4G0V1F5G8E',
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore in route handlers
            }
          },
        },
      }
    );

    // 1. Identify user / customer context
    let targetCustomerId = customer_id;
    if (!targetCustomerId) {
      const {
        data: { user },
      } = await ssrSupabase.auth.getUser();

      if (user) {
        const { data: cust } = await adminSupabase
          .from('customers')
          .select('id')
          .eq('auth_id', user.id)
          .maybeSingle();
        if (cust) targetCustomerId = cust.id;
      }
    }

    // Fallback: If still no customer_id found, query customer accounts (not staff)
    if (!targetCustomerId) {
      const { data: clientCustomer } = await adminSupabase
        .from('customers')
        .select('id')
        .eq('role', 'customer')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (clientCustomer) targetCustomerId = clientCustomer.id;
    }

    const context: ConciergeContext = {};

    if (targetCustomerId) {
      // Fetch Customer
      const { data: customer } = await adminSupabase
        .from('customers')
        .select('*')
        .eq('id', targetCustomerId)
        .maybeSingle();

      if (customer) {
        context.customerId = customer.id;
        context.customerName = customer.full_name;
        context.customerPhone = customer.phone;
        context.customerEmail = customer.email;
      }

      // Fetch Preferences (Eleven's Memory)
      const { data: prefs } = await adminSupabase
        .from('customer_preferences')
        .select('*')
        .eq('customer_id', targetCustomerId)
        .maybeSingle();

      context.customerPreferences = prefs;

      // Fetch Default Address
      const { data: address } = await adminSupabase
        .from('addresses')
        .select('*')
        .eq('customer_id', targetCustomerId)
        .eq('is_default', true)
        .maybeSingle();

      context.defaultAddress = address;

      // Fetch Recent Orders
      const { data: orders } = await adminSupabase
        .from('orders')
        .select('*, address:addresses(*)')
        .eq('customer_id', targetCustomerId)
        .order('created_at', { ascending: false })
        .limit(3);

      context.recentOrders = orders || [];
    }

    // 2. Generate AI Response
    const aiEngine = getAIEngine();
    const response = await aiEngine.generateResponse(
      message,
      history as AIConversationMessage[],
      context
    );

    // 3. If Escalated to Human, append into conversations JSON messages array for Mission Control HUD
    if (response.escalateToHuman && targetCustomerId) {
      try {
        const { data: existingConv } = await adminSupabase
          .from('conversations')
          .select('id, messages')
          .eq('customer_id', targetCustomerId)
          .eq('channel', 'sms')
          .maybeSingle();

        const timestamp = new Date().toISOString();
        const escalationEntry = {
          id: crypto.randomUUID(),
          order_id: context.recentOrders?.[0]?.id || undefined,
          stage: 'booked',
          text: `[AI CONCIERGE ESCALATION]: Customer ${context.customerName || 'User'} requested human intervention: "${message}"`,
          media_url: null,
          direction: 'inbound',
          mode: 'ai_escalation',
          created_at: timestamp,
        };

        if (existingConv) {
          const updatedMessages = Array.isArray(existingConv.messages)
            ? [...existingConv.messages, escalationEntry]
            : [escalationEntry];

          await adminSupabase
            .from('conversations')
            .update({
              messages: updatedMessages,
              updated_at: timestamp,
            })
            .eq('id', existingConv.id);
        } else {
          await adminSupabase.from('conversations').insert({
            customer_id: targetCustomerId,
            channel: 'sms',
            messages: [escalationEntry],
          });
        }
      } catch (logErr) {
        console.warn('Failed to log escalation event to conversations table:', logErr);
      }
    }

    return NextResponse.json({
      success: true,
      response,
      engine: aiEngine.name,
    });
  } catch (err: unknown) {
    console.error('Concierge API error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
