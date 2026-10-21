import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { apiError } from '@/lib/api-errors';
import { reportError } from '@/lib/error-reporting';
import { sendEmail } from '@/lib/resend';
import { SUPPORT_EMAIL, SUPPORT_PHONE } from '@/lib/constants';
import {
  CommercialInquirySchema,
  INQUIRY_SENT_MESSAGE,
  buildInquiryEmail,
  inquiryFailedMessage,
  isBotInquiry,
} from '@/lib/commercial/inquiry';

/**
 * Commercial rate card request (client 2026-10-21). Public: rate-limited by IP, with a hidden
 * field bots fill in. The enquiry is emailed to the support inbox (reply-to the business). If
 * the email can't be sent the visitor is told and given the phone number, never a false
 * "thank you"; the business and contact names go to the error log and an admin alert (the
 * error log removes emails and phone numbers).
 */
const dallasTime = (d: Date) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }).format(d);

export async function POST(request: Request) {
  try {
    const rate = await checkRateLimitAsync(`commercial-inquiry:${getClientIp(request)}`, 5, 60 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json({ error: `Too many requests. Please try again later, or call us at ${SUPPORT_PHONE}.` }, { status: 429 });
    }
    const inquiry = CommercialInquirySchema.parse(await request.json());
    if (isBotInquiry(inquiry)) return NextResponse.json({ success: true, message: INQUIRY_SENT_MESSAGE });

    const { subject, html } = buildInquiryEmail(inquiry, dallasTime(new Date()));
    if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== 'production') {
      console.info(`[commercial inquiry] Email not configured; would send "${subject}" to ${SUPPORT_EMAIL}`);
      return NextResponse.json({ success: true, message: INQUIRY_SENT_MESSAGE });
    }
    const sent = await sendEmail({ to: SUPPORT_EMAIL, subject, html, replyTo: inquiry.email });
    if (!sent.success) {
      reportError('api/commercial/inquiry', new Error(sent.error || 'Email not sent'), {
        alert: true,
        details: `Commercial inquiry not emailed: ${inquiry.business_name}, ${inquiry.contact_name}`,
      });
      return NextResponse.json({ error: inquiryFailedMessage(SUPPORT_PHONE) }, { status: 502 });
    }
    return NextResponse.json({ success: true, message: INQUIRY_SENT_MESSAGE });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Please check your details.' }, { status: 400 });
    }
    return apiError('api/commercial/inquiry', err, 500);
  }
}
