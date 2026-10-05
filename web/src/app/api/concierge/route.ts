import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedCustomer } from '@/lib/supabase/auth-helpers';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { getAIEngine } from '@/lib/ai';
import { loadConciergeContext } from '@/lib/ai/context';
import type { AIConversationMessage, ConciergeContext } from '@/lib/ai/types';
import { apiError } from '@/lib/api-errors';
import { logMessages } from '@/lib/message-log';

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
      // Eleven's Memory: preferences, default address, recent orders (P05 AR-19)
      Object.assign(context, await loadConciergeContext(adminSupabase, customer));
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

    // 5. If Escalated to Human, log it for the Mission Control HUD (one row per message, PR-26)
    if (response.escalateToHuman && targetCustomerId) {
      try {
        await logMessages(adminSupabase, [{
          customerId: targetCustomerId,
          channel: 'sms',
          direction: 'inbound',
          body: `[AI CONCIERGE ESCALATION]: Customer ${context.customerName || 'User'} requested human intervention: "${message}"`,
          orderId: context.recentOrders?.[0]?.id || null,
          stage: 'booked',
          mode: 'ai_escalation',
        }]);
      } catch (logErr) {
        console.warn('Failed to log escalation event:', logErr);
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
