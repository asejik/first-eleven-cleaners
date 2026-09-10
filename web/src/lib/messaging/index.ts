import { createAdminClient } from '@/lib/supabase/admin';
import { formatStageMessage, type MessagePayload, type FormattedMessage } from './templates';
import { sendEmail, buildStageNotificationEmailHtml } from '@/lib/resend';

export interface DispatchResult {
  success: boolean;
  mode: 'simulated' | 'live_twilio';
  messageId: string;
  channel: 'sms' | 'whatsapp';
  formatted: FormattedMessage;
  recipientPhone: string;
  timestamp: string;
  error?: string;
}

export interface IMessagingProvider {
  dispatchStageNotification(payload: MessagePayload, channel?: 'sms' | 'whatsapp'): Promise<DispatchResult>;
}

// 1. Simulated Provider (Stores to Supabase Conversations, Feeds Mission Control Simulator HUD, and sends transactional email fallback)
export class SimulatedMessageProvider implements IMessagingProvider {
  async dispatchStageNotification(payload: MessagePayload, channel: 'sms' | 'whatsapp' = 'sms'): Promise<DispatchResult> {
    const formatted = formatStageMessage(payload);
    const messageId = `sim_msg_${crypto.randomUUID().slice(0, 8)}`;
    const timestamp = new Date().toISOString();
    const content = channel === 'whatsapp' ? formatted.whatsappBody : formatted.smsBody;

    let customerEmail = payload.customerEmail;

    try {
      const supabase = createAdminClient();

      // Find customer id & email if needed
      let customerId: string | null = null;
      const { data: order } = await supabase
        .from('orders')
        .select('customer_id, customer:customers(email)')
        .eq('id', payload.orderId)
        .maybeSingle();

      if (order) {
        customerId = order.customer_id;
        const fetchedCustomer = order.customer as { email?: string } | Array<{ email?: string }> | null;
        if (!customerEmail && fetchedCustomer) {
          if (Array.isArray(fetchedCustomer) && fetchedCustomer[0]?.email) {
            customerEmail = fetchedCustomer[0].email;
          } else if ('email' in fetchedCustomer && fetchedCustomer.email) {
            customerEmail = fetchedCustomer.email;
          }
        }
      }

      // Fail-proof direct customer lookup if relation join was empty
      if (!customerEmail && customerId) {
        const { data: directCust } = await supabase
          .from('customers')
          .select('email')
          .eq('id', customerId)
          .maybeSingle();
        if (directCust?.email) {
          customerEmail = directCust.email;
        }
      }

      if (customerId) {
        // Record in conversations table
        const { data: existingConv } = await supabase
          .from('conversations')
          .select('id, messages')
          .eq('customer_id', customerId)
          .eq('channel', channel)
          .maybeSingle();

        const newMsgEntry = {
          id: messageId,
          order_id: payload.orderId,
          stage: payload.stage,
          text: content,
          media_url: formatted.mediaUrl || null,
          direction: 'outbound',
          mode: 'simulated',
          created_at: timestamp,
        };

        if (existingConv) {
          const updatedMessages = Array.isArray(existingConv.messages)
            ? [...existingConv.messages, newMsgEntry]
            : [newMsgEntry];

          await supabase
            .from('conversations')
            .update({
              messages: updatedMessages,
              updated_at: timestamp,
            })
            .eq('id', existingConv.id);
        } else {
          await supabase.from('conversations').insert({
            customer_id: customerId,
            channel,
            messages: [newMsgEntry],
          });
        }
      }
    } catch (err) {
      console.warn('Simulated message DB logging notice:', err);
    }

    // Dispatch stage notification email to customer via Resend
    if (customerEmail) {
      try {
        const emailHtml = buildStageNotificationEmailHtml({
          stageTitle: formatted.title,
          customerName: payload.customerName,
          orderNumber: payload.orderNumber,
          messageBody: content,
          pickupDate: payload.pickupDate,
          pickupWindow: payload.pickupWindow,
          deliveryDate: payload.deliveryDate,
          deliveryWindow: payload.deliveryWindow,
          total: payload.total,
          trackingUrl: payload.trackingUrl,
        });

        const emailResult = await sendEmail({
          to: customerEmail,
          subject: `${formatted.title} — Order #${payload.orderNumber} | First Eleven Cleaners`,
          html: emailHtml,
        });

        if (!emailResult.success) {
          console.error(`[Notification Engine] Failed to dispatch ${payload.stage} email to ${customerEmail}:`, emailResult.error);
        } else {
          console.log(`[Notification Engine] Dispatched ${payload.stage} email to ${customerEmail} (ID: ${emailResult.id})`);
        }
      } catch (emailErr) {
        console.warn('Status notification email dispatch notice:', emailErr);
      }
    } else {
      console.warn(`[Notification Engine] No customerEmail found for order ${payload.orderId}, skipping email dispatch.`);
    }

    return {
      success: true,
      mode: 'simulated',
      messageId,
      channel,
      formatted,
      recipientPhone: payload.customerPhone,
      timestamp,
    };
  }
}

// 2. Live Twilio Provider (Plug-and-Play when credentials exist in .env.local)
export class TwilioMessageProvider implements IMessagingProvider {
  private fallbackSim = new SimulatedMessageProvider();

  async dispatchStageNotification(payload: MessagePayload, channel: 'sms' | 'whatsapp' = 'sms'): Promise<DispatchResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
    const twilioWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

    const hasValidTwilio =
      Boolean(accountSid) &&
      Boolean(authToken) &&
      Boolean(twilioPhone) &&
      !accountSid?.includes('your-account') &&
      !authToken?.includes('your-token');

    // If credentials are not present, seamlessly use simulation
    if (!hasValidTwilio) {
      return this.fallbackSim.dispatchStageNotification(payload, channel);
    }

    const formatted = formatStageMessage(payload);
    const body = channel === 'whatsapp' ? formatted.whatsappBody : formatted.smsBody;
    const fromNumber = channel === 'whatsapp' ? twilioWhatsApp : twilioPhone;
    const toNumber = channel === 'whatsapp' ? `whatsapp:${payload.customerPhone}` : payload.customerPhone;

    try {
      // Use Twilio REST API directly
      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const params = new URLSearchParams({
        To: toNumber,
        From: fromNumber!,
        Body: body,
      });

      if (formatted.mediaUrl) {
        params.append('MediaUrl', formatted.mediaUrl);
      }

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Twilio API dispatch failure');
      }

      // Record to DB
      const simResult = await this.fallbackSim.dispatchStageNotification(payload, channel);

      return {
        ...simResult,
        mode: 'live_twilio',
        messageId: data.sid || simResult.messageId,
      };
    } catch (err: unknown) {
      console.error('Twilio dispatch error, falling back to simulated log:', err);
      return this.fallbackSim.dispatchStageNotification(payload, channel);
    }
  }
}

// Export default singleton instance
export const messagingService: IMessagingProvider = new TwilioMessageProvider();
