import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedCustomer } from '@/lib/supabase/auth-helpers';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { getAIEngine } from '@/lib/ai';
import type { AIConversationMessage, ConciergeContext } from '@/lib/ai/types';
import type { Address, Order, CustomerPreferences } from '@/types';
import { apiError } from '@/lib/api-errors';

// Request size and cost limits (SEC-10): every message calls the paid AI API
const MAX_MESSAGE_CHARS = 1000;
const MAX_HISTORY_TURNS = 10;
const MAX_HISTORY_TURN_CHARS = 2000;
const ONE_MINUTE = 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  try {
    // 1. Shared (Upstash-backed) rate limits per IP: burst and daily cost cap
    const clientIp = getClientIp(req);
    const [minuteCheck, dayCheck] = await Promise.all([
      checkRateLimitAsync(`concierge:${clientIp}`, 15, ONE_MINUTE),
      checkRateLimitAsync(`concierge_day:${clientIp}`, 100, ONE_DAY),
    ]);
    if (!minuteCheck.allowed || !dayCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment before sending another message.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { message, history = [] } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        { error: `Please keep messages under ${MAX_MESSAGE_CHARS} characters.` },
        { status: 400 }
      );
    }

    // Client-held history: keep recent user/assistant turns only, each length-capped
    const safeHistory: AIConversationMessage[] = (Array.isArray(history) ? history : [])
      .filter(
        (h: unknown): h is AIConversationMessage =>
          typeof h === 'object' &&
          h !== null &&
          ((h as AIConversationMessage).role === 'user' || (h as AIConversationMessage).role === 'assistant') &&
          typeof (h as AIConversationMessage).content === 'string'
      )
      .slice(-MAX_HISTORY_TURNS)
      .map((h) => ({ role: h.role, content: h.content.slice(0, MAX_HISTORY_TURN_CHARS) }));

    const adminSupabase = createAdminClient();

    // 2. Identify user / customer context strictly via authenticated session
    let targetCustomerId: string | null = null;
    const { customer } = await getAuthenticatedCustomer(req);

    if (customer) {
      const userDayCheck = await checkRateLimitAsync(`concierge_user_day:${customer.id}`, 300, ONE_DAY);
      if (!userDayCheck.allowed) {
        return NextResponse.json(
          { error: "You've reached today's message limit. Please call us or try again tomorrow." },
          { status: 429 }
        );
      }
    }

    if (customer) {
      targetCustomerId = customer.id;
    }

    const context: ConciergeContext = {};

    if (targetCustomerId && customer) {
      context.customerId = customer.id;
      context.customerName = customer.full_name;
      context.customerPhone = customer.phone;
      context.customerEmail = customer.email;

      // Fetch Preferences (Eleven's Memory)
      const { data: prefs } = await adminSupabase
        .from('customer_preferences')
        .select('customer_id, starch_level, fold_vs_hang, detergent_sensitivity, gate_code, delivery_instructions, special_notes')
        .eq('customer_id', targetCustomerId)
        .maybeSingle();

      context.customerPreferences = (prefs as unknown as CustomerPreferences) || null;

      // Fetch Default Address
      const { data: address } = await adminSupabase
        .from('addresses')
        .select('id, street, unit, city, state, zip, delivery_notes')
        .eq('customer_id', targetCustomerId)
        .eq('is_default', true)
        .maybeSingle();

      context.defaultAddress = (address as unknown as Address) || null;

      // Fetch Recent Orders
      const { data: orders } = await adminSupabase
        .from('orders')
        .select(`
          id, order_number, status, order_type, pickup_date, total,
          address:addresses(street, city, zip)
        `)
        .eq('customer_id', targetCustomerId)
        .order('created_at', { ascending: false })
        .limit(3);

      context.recentOrders = (orders as unknown as Order[]) || [];
    }

    // 3. Generate AI Response
    const aiEngine = getAIEngine();
    const response = await aiEngine.generateResponse(
      message,
      safeHistory,
      context
    );

    // The concierge never creates orders (SEC-10). Booking requests get the engine's
    // "Review & Confirm Pickup Slot" action, which opens /book, where pricing, zone,
    // capacity and card-on-file rules apply.

    // 5. If Escalated to Human, append into conversations JSON messages array for Mission Control HUD
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
      createdOrder: null,
      engine: aiEngine.name,
    });
  } catch (err: unknown) {
    console.error('Concierge API error:', err);
    return apiError('api/concierge', err, 500);
  }
}
