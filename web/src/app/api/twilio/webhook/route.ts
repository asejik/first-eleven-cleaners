import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import { getAIEngine } from '@/lib/ai';
import type { AIConversationMessage, ConciergeContext } from '@/lib/ai/types';
import type { Address, Order, CustomerPreferences } from '@/types';

// Helper to wrap message text in valid TwiML XML
function createTwimlResponse(message: string): Response {
  const sanitized = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${sanitized}</Message>
</Response>`;

  return new Response(twiml, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
    },
  });
}

// Clean phone string to numeric digits for matching
function normalizeDigits(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

export async function GET() {
  return NextResponse.json({
    status: 'online',
    service: 'First Eleven Cleaners — Twilio Inbound Webhook Gateway for Eleven',
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  try {
    // 1. IP Rate Limiting
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`twilio_inbound:${clientIp}`, 60, 60 * 1000);
    if (!rateCheck.allowed) {
      return createTwimlResponse('First Eleven: Too many requests. Please wait a moment before sending another message.');
    }

    // 2. Parse Incoming Payload (supports application/x-www-form-urlencoded and application/json)
    const contentType = req.headers.get('content-type') || '';
    let from = '';
    let to = '';
    let body = '';
    let messageSid = '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      from = (formData.get('From') as string) || '';
      to = (formData.get('To') as string) || '';
      body = (formData.get('Body') as string) || '';
      messageSid = (formData.get('MessageSid') as string) || '';
    } else {
      const json = await req.json();
      from = json.From || json.from || '';
      to = json.To || json.to || '';
      body = json.Body || json.body || json.message || '';
      messageSid = json.MessageSid || json.messageSid || '';
    }

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      return createTwimlResponse('First Eleven Cleaners: We received an empty message. How can we assist you today?');
    }

    const isWhatsApp = from.startsWith('whatsapp:');
    const rawSenderPhone = from.replace(/^whatsapp:/, '');
    const senderDigits = normalizeDigits(rawSenderPhone);

    const isSupabaseConfigured =
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

    const adminSupabase = isSupabaseConfigured ? createAdminClient() : null;

    // 3. Mandatory Carrier Compliance Keywords (A2P 10DLC & CTIA Guidelines)
    const upperMsg = trimmedBody.toUpperCase();

    // STOP / UNSUBSCRIBE
    if (/^(STOP|UNSUBSCRIBE|CANCEL|QUIT|END)$/i.test(upperMsg)) {
      if (adminSupabase && senderDigits) {
        try {
          const { data: matchedCust } = await adminSupabase
            .from('customers')
            .select('id, phone')
            .or(`phone.eq.${rawSenderPhone},phone.ilike.%${senderDigits.slice(-10)}%`)
            .maybeSingle();

          if (matchedCust) {
            await adminSupabase
              .from('customers')
              .update({
                sms_consent: false,
                sms_promotions_consent: false,
                updated_at: new Date().toISOString(),
              })
              .eq('id', matchedCust.id);
          }
        } catch (dbErr) {
          console.warn('Error recording STOP opt-out:', dbErr);
        }
      }

      return createTwimlResponse(
        'First Eleven Cleaners: You have been unsubscribed and will no longer receive SMS messages. Reply START to resubscribe or email concierge@firstelevencleaners.com for assistance.'
      );
    }

    // START / UNSTOP
    if (/^(START|UNSTOP)$/i.test(upperMsg)) {
      if (adminSupabase && senderDigits) {
        try {
          const { data: matchedCust } = await adminSupabase
            .from('customers')
            .select('id')
            .or(`phone.eq.${rawSenderPhone},phone.ilike.%${senderDigits.slice(-10)}%`)
            .maybeSingle();

          if (matchedCust) {
            await adminSupabase
              .from('customers')
              .update({
                sms_consent: true,
                sms_consent_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', matchedCust.id);
          }
        } catch (dbErr) {
          console.warn('Error recording START opt-in:', dbErr);
        }
      }

      return createTwimlResponse(
        'First Eleven Cleaners: You have successfully resubscribed to notifications. Reply HELP for help, STOP to cancel. Msg & data rates may apply.'
      );
    }

    // HELP / INFO
    if (/^(HELP|INFO)$/i.test(upperMsg)) {
      return createTwimlResponse(
        'First Eleven Cleaners: For support, call or text (682) 200-0039 or email concierge@firstelevencleaners.com. 48-hr turnaround & free Metroplex delivery. Reply STOP to cancel. Msg & data rates may apply.'
      );
    }

    // 4. Look up Customer in Supabase to provide Eleven with personalized context
    let targetCustomerId: string | null = null;
    const context: ConciergeContext = {};

    if (adminSupabase && senderDigits.length >= 7) {
      try {
        const last10 = senderDigits.slice(-10);
        const { data: customer } = await adminSupabase
          .from('customers')
          .select('id, full_name, email, phone')
          .or(`phone.eq.${rawSenderPhone},phone.ilike.%${last10}%`)
          .maybeSingle();

        if (customer) {
          targetCustomerId = customer.id;
          context.customerId = customer.id;
          context.customerName = customer.full_name;
          context.customerPhone = customer.phone;
          context.customerEmail = customer.email;

          // Fetch Customer Preferences (Eleven's Memory)
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
            .select('id, order_number, status, order_type, pickup_date, total')
            .eq('customer_id', targetCustomerId)
            .order('created_at', { ascending: false })
            .limit(3);

          context.recentOrders = (orders as unknown as Order[]) || [];
        }
      } catch (lookupErr) {
        console.warn('Customer lookup error for SMS sender:', lookupErr);
      }
    }

    // 5. Fetch recent conversation history from conversations table
    const history: AIConversationMessage[] = [];
    if (adminSupabase && targetCustomerId) {
      try {
        const channelName = isWhatsApp ? 'whatsapp' : 'sms';
        const { data: conv } = await adminSupabase
          .from('conversations')
          .select('id, messages')
          .eq('customer_id', targetCustomerId)
          .eq('channel', channelName)
          .maybeSingle();

        if (conv && Array.isArray(conv.messages)) {
          const recent = conv.messages.slice(-6);
          for (const m of recent) {
            if (m.direction === 'inbound' && m.text) {
              history.push({ role: 'user', content: m.text });
            } else if (m.direction === 'outbound' && m.text) {
              history.push({ role: 'assistant', content: m.text });
            }
          }
        }
      } catch (convErr) {
        console.warn('Conversation history fetch error:', convErr);
      }
    }

    // 6. Generate AI Response via Eleven Master AI Concierge
    const aiEngine = getAIEngine();
    const aiResponse = await aiEngine.generateResponse(trimmedBody, history, context);

    let replyText = aiResponse.content.trim();

    // Ensure SMS response is concise and contains contact info if appropriate
    if (!replyText) {
      replyText = "First Eleven Cleaners: Thank you for reaching out! How can our master cleaning team assist you today?";
    }

    // 7. Store incoming message and outgoing reply in conversations table
    if (adminSupabase && targetCustomerId) {
      try {
        const channelName = isWhatsApp ? 'whatsapp' : 'sms';
        const nowIso = new Date().toISOString();

        const inboundMsg = {
          id: messageSid || `inbound_${crypto.randomUUID().slice(0, 8)}`,
          text: trimmedBody,
          direction: 'inbound',
          from,
          to,
          created_at: nowIso,
        };

        const outboundMsg = {
          id: `reply_${crypto.randomUUID().slice(0, 8)}`,
          text: replyText,
          direction: 'outbound',
          from: to,
          to: from,
          created_at: new Date(Date.now() + 500).toISOString(),
        };

        const { data: existingConv } = await adminSupabase
          .from('conversations')
          .select('id, messages')
          .eq('customer_id', targetCustomerId)
          .eq('channel', channelName)
          .maybeSingle();

        if (existingConv) {
          const updatedMessages = Array.isArray(existingConv.messages)
            ? [...existingConv.messages, inboundMsg, outboundMsg]
            : [inboundMsg, outboundMsg];

          await adminSupabase
            .from('conversations')
            .update({
              messages: updatedMessages,
              updated_at: nowIso,
            })
            .eq('id', existingConv.id);
        } else {
          await adminSupabase.from('conversations').insert({
            customer_id: targetCustomerId,
            channel: channelName,
            messages: [inboundMsg, outboundMsg],
          });
        }
      } catch (saveErr) {
        console.warn('Error saving inbound/reply conversation messages:', saveErr);
      }
    }

    // 8. Return TwiML XML response to Twilio
    return createTwimlResponse(replyText);
  } catch (err: unknown) {
    console.error('Twilio inbound webhook error:', err);
    return createTwimlResponse(
      'First Eleven Cleaners: We received your message and our concierge team is reviewing it. You can also call us at (682) 200-0039.'
    );
  }
}
