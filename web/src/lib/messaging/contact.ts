import { toE164 } from '@/lib/phone';
import { sendEmail, buildNoticeEmailHtml } from '@/lib/resend';

/**
 * A message to someone with no order yet (the Zone 5 waitlist, client 2026-10-08): a text when
 * they ticked "text me" and Twilio is set up, otherwise an email. Not in the message log (that
 * is per customer); the waitlist row records when they were told.
 */
export interface ContactMessage {
  phone?: string | null;
  email?: string | null;
  smsConsent: boolean;
  /** Email subject and heading */
  title: string;
  body: string;
}

export type ContactResult = { channel: 'sms' | 'email' | 'none'; ok: boolean; error?: string };

function twilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const valid =
    Boolean(accountSid) && Boolean(authToken) && Boolean(messagingServiceSid || from) && !accountSid?.includes('your-account') && !authToken?.includes('your-token');
  return valid ? { accountSid: accountSid!, authToken: authToken!, from, messagingServiceSid } : null;
}

async function sendSms(to: string, body: string): Promise<ContactResult> {
  const twilio = twilioConfig();
  if (!twilio) return { channel: 'sms', ok: false, error: 'Twilio is not configured' };
  const params = new URLSearchParams({ To: to, Body: body });
  // Outbound SMS goes through the A2P 10DLC Messaging Service when there is one
  if (twilio.messagingServiceSid) params.append('MessagingServiceSid', twilio.messagingServiceSid);
  else if (twilio.from) params.append('From', twilio.from);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { channel: 'sms', ok: false, error: (data as { message?: string }).message || `Twilio error ${res.status}` };
    }
    return { channel: 'sms', ok: true };
  } catch (err) {
    return { channel: 'sms', ok: false, error: (err as Error).message };
  }
}

export async function sendContactMessage({ phone, email, smsConsent, title, body }: ContactMessage): Promise<ContactResult> {
  const to = toE164(phone || '');
  if (smsConsent && to && twilioConfig()) {
    const sms = await sendSms(to, body);
    if (sms.ok || !email) return sms;
  }
  if (!email) return { channel: 'none', ok: false, error: 'No way to reach them' };
  const result = await sendEmail({ to: email, subject: `${title} | First Eleven Cleaners`, html: buildNoticeEmailHtml({ title, messageBody: body }) });
  return { channel: 'email', ok: result.success, error: result.error };
}
