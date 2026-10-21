import { z } from 'zod';
import { escapeHtml, personNameSchema } from '@/lib/sanitize';
import { COMMERCIAL_PROPOSAL_TIME } from '@/lib/commercial/promises';
import { INDUSTRIES, VOLUMES } from '@/lib/commercial/inquiry-options';

/**
 * The Commercial page's rate card request (client 2026-10-21: "we respond the same business
 * day"). Each enquiry is emailed to the support inbox with the business as reply-to, so the
 * team answers it straight from email. Nothing is sent to the address typed in the form.
 */
const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const CommercialInquirySchema = z.object({
  business_name: z.string().trim().min(2, 'Please enter your business name.').max(150),
  contact_name: personNameSchema,
  email: z.string().trim().email('Please enter a valid work email.').max(255),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v.replace(/\D/g, '').length >= 10, 'Please enter a valid phone number.'),
  industry: z.enum(keys(INDUSTRIES)),
  volume: z.enum(keys(VOLUMES)),
  notes: z.string().trim().max(2000).optional().default(''),
  /** Hidden from people; a bot that fills it is thanked and ignored */
  website: z.string().max(500).optional().default(''),
});

export type CommercialInquiry = z.infer<typeof CommercialInquirySchema>;

/** Filled in the hidden field: a bot */
export const isBotInquiry = (inquiry: CommercialInquiry) => inquiry.website.trim() !== '';

export const INQUIRY_SENT_MESSAGE = `Thank you. We reply the same business day, and your proposal follows ${COMMERCIAL_PROPOSAL_TIME}.`;

export function inquiryFailedMessage(phone: string): string {
  return `We couldn't send your inquiry just now. Please try again, or call us at ${phone}.`;
}

/** Subject and HTML of the email to the support inbox */
export function buildInquiryEmail(inquiry: CommercialInquiry, receivedAt: string): { subject: string; html: string } {
  const rows: [string, string][] = [
    ['Business', inquiry.business_name],
    ['Contact', inquiry.contact_name],
    ['Email', inquiry.email],
    ['Phone', inquiry.phone],
    ['Industry', INDUSTRIES[inquiry.industry]],
    ['Volume', VOLUMES[inquiry.volume]],
    ['Received', receivedAt],
  ];
  const table = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding: 6px 12px 6px 0; color: #64748b; vertical-align: top;">${label}</td><td style="padding: 6px 0; color: #0B1F3A;">${escapeHtml(value)}</td></tr>`
    )
    .join('');
  const notes = inquiry.notes
    ? `<h3 style="color: #0B1F3A; font-size: 15px; margin: 24px 0 8px;">Requirements</h3><p style="margin: 0; color: #1e293b; white-space: pre-wrap;">${escapeHtml(inquiry.notes)}</p>`
    : '';
  return {
    subject: `Commercial inquiry: ${inquiry.business_name.replace(/[\r\n]+/g, ' ')}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Commercial inquiry</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 28px;">
    <h2 style="color: #0B1F3A; margin: 0 0 4px; font-size: 18px;">New commercial inquiry</h2>
    <p style="margin: 0 0 16px; color: #64748b; font-size: 14px;">Promised: a reply the same business day, a proposal ${COMMERCIAL_PROPOSAL_TIME}. Reply to this email to answer them.</p>
    <table style="font-size: 15px; border-collapse: collapse;">${table}</table>
    ${notes}
  </div>
</body>
</html>
`,
  };
}
