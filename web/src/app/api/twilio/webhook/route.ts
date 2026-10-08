import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { getAIEngine } from '@/lib/ai';
import { loadConciergeContext } from '@/lib/ai/context';
import { getAppBaseUrl } from '@/lib/constants';
import type { AIConversationMessage, ConciergeContext } from '@/lib/ai/types';
import { toE164 } from '@/lib/phone';
import { reportError } from '@/lib/error-reporting';
import { logMessages, recentMessages } from '@/lib/message-log';
import { skipNextZone5Pickup, SKIP_NOTHING_REPLY } from '@/lib/zone5-skip';

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

/**
 * Validates the cryptographic Twilio HMAC-SHA1 signature (SEC-004).
 */
function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  authToken: string
): boolean {
  try {
    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) {
      data += `${key}${params[key]}`;
    }
    const computed = crypto
      .createHmac('sha1', authToken)
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');

    const sigBuf = Buffer.from(signature);
    const compBuf = Buffer.from(computed);
    if (sigBuf.length !== compBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, compBuf);
  } catch {
    return false;
  }
}

// Clean phone string to numeric digits for matching

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
    const rateCheck = await checkRateLimitAsync(`twilio_inbound:${clientIp}`, 60, 60 * 1000);
    if (!rateCheck.allowed) {
      return createTwimlResponse('First Eleven: Too many requests. Please wait a moment before sending another message.');
    }

    // 2. Parse Incoming Payload (supports application/x-www-form-urlencoded and application/json)
    const contentType = req.headers.get('content-type') || '';
    let from = '';
    let to = '';
    let body = '';
    let messageSid = '';
    const rawParams: Record<string, string> = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      formData.forEach((val, key) => {
        if (typeof val === 'string') rawParams[key] = val;
      });
      from = (formData.get('From') as string) || '';
      to = (formData.get('To') as string) || '';
      body = (formData.get('Body') as string) || '';
      messageSid = (formData.get('MessageSid') as string) || '';
    } else {
      const json = await req.json();
      Object.entries(json).forEach(([k, v]) => {
        if (typeof v === 'string') rawParams[k] = v;
      });
      from = json.From || json.from || '';
      to = json.To || json.to || '';
      body = json.Body || json.body || json.message || '';
      messageSid = json.MessageSid || json.messageSid || '';
    }

    // 3. Twilio Cryptographic Signature Verification (SEC-004)
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const isLiveTwilio = Boolean(
      authToken &&
      !authToken.includes('placeholder') &&
      !authToken.includes('your-')
    );

    // Fail closed in production (SEC-14): without the auth token, signatures can't be checked,
    // so anyone could post fake inbound messages (STOP/START for any number, AI as any customer).
    if (!isLiveTwilio && process.env.NODE_ENV === 'production') {
      console.error('[Twilio Webhook] TWILIO_AUTH_TOKEN is missing in production; rejecting request');
      return new Response('Twilio webhook configuration error: auth token missing.', { status: 500 });
    }

    if (authToken && isLiveTwilio) {
      const twilioSignature = req.headers.get('x-twilio-signature');
      if (!twilioSignature) {
        return new Response('Forbidden: Missing X-Twilio-Signature header.', { status: 403 });
      }

      const candidateUrls = [
        req.url,
        `${getAppBaseUrl()}/api/twilio/webhook`,
      ];

      const isValid = candidateUrls.some((targetUrl) =>
        verifyTwilioSignature(targetUrl, rawParams, twilioSignature, authToken)
      );

      if (!isValid) {
        return new Response('Forbidden: Invalid X-Twilio-Signature verification.', { status: 403 });
      }
    }

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      return createTwimlResponse('First Eleven Cleaners: We received an empty message. How can we assist you today?');
    }

    const isWhatsApp = from.startsWith('whatsapp:');
    const rawSenderPhone = from.replace(/^whatsapp:/, '');
    // Stored phones are E.164 (PR-18): match on the sender's E.164 form
    const senderE164 = toE164(rawSenderPhone);

    const isSupabaseConfigured =
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

    const adminSupabase = isSupabaseConfigured ? createAdminClient() : null;

    // 3. Mandatory Carrier Compliance Keywords (A2P 10DLC & CTIA Guidelines)
    const upperMsg = trimmedBody.toUpperCase();

    // STOP / UNSUBSCRIBE
    if (/^(STOP|UNSUBSCRIBE|CANCEL|QUIT|END)$/i.test(upperMsg)) {
      if (adminSupabase && senderE164) {
        try {
          // Every record with this number (e.g. a guest record and an account) is opted out
          const { error: consentErr } = await adminSupabase
            .from('customers')
            .update({
              sms_consent: false,
              sms_promotions_consent: false,
              updated_at: new Date().toISOString(),
            })
            .eq('phone', senderE164);
          if (consentErr) reportError('twilio/consent', consentErr, { alert: true, details: 'Could not record an SMS STOP opt-out' });
          // And the waitlist (client 2026-10-08: its texts say "Reply STOP to opt out")
          const { error: waitlistErr } = await adminSupabase.from('waitlist').update({ sms_consent: false }).eq('phone', senderE164);
          if (waitlistErr) reportError('twilio/consent', waitlistErr, { alert: true, details: 'Could not record an SMS STOP opt-out on the waitlist' });
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
      if (adminSupabase && senderE164) {
        try {
          const { error: consentErr } = await adminSupabase
            .from('customers')
            .update({
              sms_consent: true,
              sms_consent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('phone', senderE164);
          if (consentErr) reportError('twilio/consent', consentErr, { alert: true, details: 'Could not record an SMS START opt-in' });
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

    // SKIP: off the next Zone 5 run (client 2026-10-08, the "route not reached" text)
    if (/^SKIP$/i.test(upperMsg)) {
      if (!adminSupabase || !senderE164) return createTwimlResponse(SKIP_NOTHING_REPLY);
      try {
        return createTwimlResponse(await skipNextZone5Pickup(adminSupabase, senderE164));
      } catch (skipErr) {
        reportError('twilio/skip', skipErr, { alert: true, details: 'A SKIP reply could not cancel the Zone 5 pickup' });
        return createTwimlResponse('First Eleven Cleaners: We could not skip your pickup just now. Please call (682) 200-0039 and we will take care of it.');
      }
    }

    // 4. Look up Customer in Supabase to provide Eleven with personalized context
    let targetCustomerId: string | null = null;
    const context: ConciergeContext = {};

    if (adminSupabase && senderE164) {
      try {
        // Several records can share a number; use the most recent (PR-18)
        const { data: customer } = await adminSupabase
          .from('customers')
          .select('id, full_name, email, phone')
          .eq('phone', senderE164)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (customer) {
          targetCustomerId = customer.id;
          // Eleven's Memory: preferences, default address, recent orders (P05 AR-19)
          Object.assign(context, await loadConciergeContext(adminSupabase, customer));
        }
      } catch (lookupErr) {
        console.warn('Customer lookup error for SMS sender:', lookupErr);
      }
    }

    // 5. Fetch recent message history
    const history: AIConversationMessage[] = [];
    if (adminSupabase && targetCustomerId) {
      try {
        const channelName = isWhatsApp ? 'whatsapp' : 'sms';
        const recent = await recentMessages(adminSupabase, targetCustomerId, channelName, 6);
        for (const m of recent) {
          if (!m.body) continue;
          history.push({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.body });
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

    // 7. Store incoming message and outgoing reply
    if (adminSupabase && targetCustomerId) {
      try {
        const channelName = isWhatsApp ? 'whatsapp' : 'sms';
        const nowIso = new Date().toISOString();

        // One row per message (PR-26)
        await logMessages(adminSupabase, [
          {
            customerId: targetCustomerId,
            channel: channelName,
            direction: 'inbound',
            body: trimmedBody,
            externalId: messageSid || null,
            from,
            to,
            createdAt: nowIso,
          },
          {
            customerId: targetCustomerId,
            channel: channelName,
            direction: 'outbound',
            body: replyText,
            mode: 'ai_reply',
            from: to,
            to: from,
            createdAt: new Date(Date.now() + 500).toISOString(),
          },
        ]);
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
