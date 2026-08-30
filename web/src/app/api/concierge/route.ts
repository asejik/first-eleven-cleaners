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

    let createdOrderRecord = null;

    // 3. Conversational Booking Execution: Detect if customer confirmed a pickup booking
    const isBookingConfirmation =
      /\b(lock in|confirm|schedule|book|agendar|confirmar|yes|si|ready|proceed)\b/i.test(message) &&
      (/\b(pickup|evening|morning|order|tonight|tomorrow|shift|recoleccion)\b/i.test(message) ||
        /locked in|confirmed|scheduled|orden confirmada/i.test(response.content));

    if (isBookingConfirmation && targetCustomerId) {
      try {
        const orderNumber = `F11-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const pickupDate = new Date().toISOString().split('T')[0];
        
        const pickup = new Date();
        const delivery = new Date(pickup);
        delivery.setDate(delivery.getDate() + 2);
        if (delivery.getDay() === 0) delivery.setDate(delivery.getDate() + 1);
        const deliveryDate = delivery.toISOString().split('T')[0];

        const isEvening = /evening|tarde|tonight|noche/i.test(message) || /evening/i.test(response.content);
        const pickupWindow = isEvening ? 'evening' : 'morning';

        // Extract total price from AI message if present (e.g. $113.90) or fallback
        const priceMatch = response.content.match(/\$(\d+(\.\d{2})?)/);
        const totalAmount = priceMatch ? parseFloat(priceMatch[1]) : 75.00;

        // Ensure we have an address ID
        let addressId = context.defaultAddress?.id;
        if (!addressId) {
          const { data: firstAddr } = await adminSupabase
            .from('addresses')
            .select('id')
            .eq('customer_id', targetCustomerId)
            .limit(1)
            .maybeSingle();

          if (firstAddr) {
            addressId = firstAddr.id;
          } else {
            const { data: createdAddr } = await adminSupabase
              .from('addresses')
              .insert({
                customer_id: targetCustomerId,
                street: 'No. 24 Basin Road',
                unit: 'Apt 304',
                city: 'Dallas',
                state: 'TX',
                zip: '75205',
                is_default: true,
              })
              .select('id')
              .single();
            if (createdAddr) addressId = createdAddr.id;
          }
        }

        // Insert new confirmed order into database
        const { data: insertedOrder, error: orderInsertErr } = await adminSupabase
          .from('orders')
          .insert({
            order_number: orderNumber,
            customer_id: targetCustomerId,
            address_id: addressId,
            status: 'booked',
            order_type: 'mixed',
            pickup_date: pickupDate,
            pickup_window: pickupWindow,
            delivery_date: deliveryDate,
            delivery_window: pickupWindow,
            subtotal: totalAmount,
            total: totalAmount,
            payment_status: 'authorized',
            notes: `Booked via Eleven AI Concierge. Customer note: "${message}"`,
          })
          .select('*')
          .single();

        if (!orderInsertErr && insertedOrder) {
          createdOrderRecord = insertedOrder;

          // Insert order event
          await adminSupabase.from('order_events').insert({
            order_id: insertedOrder.id,
            status: 'booked',
            note: `Pickup booked conversatially via Eleven AI Concierge for ${pickupDate} (${pickupWindow === 'morning' ? '7:30-10:00 AM' : '5:00-8:00 PM'})`,
            triggered_by: 'Eleven AI Concierge',
          });

          // Insert standard order items
          await adminSupabase.from('order_items').insert([
            {
              order_id: insertedOrder.id,
              garment_type: '2-Piece Suit',
              service_type: 'dry_clean',
              quantity: 2,
              unit_price: 19.95,
              subtotal: 39.90,
            },
            {
              order_id: insertedOrder.id,
              garment_type: 'Formal Dress',
              service_type: 'dry_clean',
              quantity: 1,
              unit_price: 14.00,
              subtotal: 14.00,
            },
            {
              order_id: insertedOrder.id,
              garment_type: 'wash_fold',
              service_type: 'wash_fold',
              quantity: 1,
              unit_price: 3.00,
              subtotal: 60.00,
              notes: '20 lbs wash & fold laundry',
            },
          ]);

          // Attach live tracking action button
          response.action = {
            type: 'track_order',
            label: `📍 View Live Domino's Tracker (#${orderNumber})`,
            url: `/track/${insertedOrder.id}`,
          };
        }
      } catch (bookErr) {
        console.warn('Conversational booking auto-insert notice:', bookErr);
      }
    }

    // 4. If Escalated to Human, append into conversations JSON messages array for Mission Control HUD
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
          order_id: createdOrderRecord?.id || context.recentOrders?.[0]?.id || undefined,
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
      createdOrder: createdOrderRecord,
      engine: aiEngine.name,
    });
  } catch (err: unknown) {
    console.error('Concierge API error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
