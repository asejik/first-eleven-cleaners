// ============================================================================
// FIRST ELEVEN CLEANERS — Resend Transactional Email Service
// ============================================================================

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Send an email via Resend REST API using process.env.RESEND_API_KEY
 */
export async function sendEmail({
  to,
  subject,
  html,
  from,
  replyTo = 'concierge@firstelevencleaners.com',
}: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const sender = from || process.env.RESEND_FROM_EMAIL || 'First Eleven Cleaners <concierge@firstelevencleaners.com>';

  if (!apiKey) {
    console.warn('RESEND_API_KEY is not configured in .env.local');
    return {
      success: false,
      error: 'RESEND_API_KEY is not configured in environment variables.',
    };
  }

  const recipients = Array.isArray(to) ? to : [to];

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: sender,
        to: recipients,
        reply_to: replyTo,
        subject,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Resend API Error:', data);
      return {
        success: false,
        error: data.message || `Resend error code ${res.status}`,
      };
    }

    return {
      success: true,
      id: data.id,
    };
  } catch (err: unknown) {
    console.error('Failed to send email via Resend:', err);
    return {
      success: false,
      error: (err as Error).message || 'Network error while contacting Resend',
    };
  }
}

/**
 * Branded Corporate B2B Statement HTML Template
 */
export function buildStatementEmailHtml({
  businessName,
  invoiceNumber,
  billingPeriod,
  subtotal,
  tax,
  total,
  status,
  items,
}: {
  businessName: string;
  invoiceNumber: string;
  billingPeriod: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  items: Array<{ description: string; quantity: number; unit: string; unit_price: number; total: number }>;
}): string {
  const itemsHtml = items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 12px; font-size: 14px; color: #1e293b;">${item.description}</td>
        <td style="padding: 10px 12px; font-size: 14px; color: #64748b; text-align: center;">${item.quantity} ${item.unit}</td>
        <td style="padding: 10px 12px; font-size: 14px; color: #64748b; text-align: right;">$${item.unit_price.toFixed(2)}</td>
        <td style="padding: 10px 12px; font-size: 14px; color: #0f172a; font-weight: bold; text-align: right;">$${item.total.toFixed(2)}</td>
      </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Statement ${invoiceNumber}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
  <div style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.05);">
    
    <!-- Header -->
    <div style="background-color: #0B1F3A; padding: 24px 28px; text-align: center; border-bottom: 3px solid #C9A14A;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 1px;">FIRST ELEVEN CLEANERS</h1>
      <p style="color: #C9A14A; margin: 4px 0 0; font-size: 12px; text-transform: uppercase; font-weight: bold;">Commercial Enterprise Billing & Accounts</p>
    </div>

    <!-- Body -->
    <div style="padding: 28px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
        <div>
          <p style="margin: 0; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold;">Billed To</p>
          <h2 style="margin: 4px 0 0; font-size: 18px; color: #0f172a;">${businessName}</h2>
          <p style="margin: 2px 0 0; font-size: 13px; color: #64748b;">Billing Cycle: ${billingPeriod}</p>
        </div>
      </div>

      <div style="background-color: #f1f5f9; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
        <span style="font-size: 13px; color: #475569;">Statement Ref: <strong>#${invoiceNumber}</strong></span> • 
        <span style="font-size: 13px; color: #475569;">Status: <strong style="color: ${status === 'paid' ? '#16a34a' : '#ea580c'}; text-transform: uppercase;">${status.toUpperCase()}</strong></span>
      </div>

      <!-- Items Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1;">
            <th style="padding: 8px 12px; font-size: 12px; color: #475569; text-align: left; text-transform: uppercase;">Service</th>
            <th style="padding: 8px 12px; font-size: 12px; color: #475569; text-align: center; text-transform: uppercase;">Qty</th>
            <th style="padding: 8px 12px; font-size: 12px; color: #475569; text-align: right; text-transform: uppercase;">Rate</th>
            <th style="padding: 8px 12px; font-size: 12px; color: #475569; text-align: right; text-transform: uppercase;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- Totals -->
      <div style="border-top: 2px solid #e2e8f0; padding-top: 14px; text-align: right; font-size: 14px; color: #475569;">
        <p style="margin: 4px 0;">Subtotal: <strong>$${subtotal.toFixed(2)}</strong></p>
        <p style="margin: 4px 0;">Texas Sales Tax (8.25%): <strong>$${tax.toFixed(2)}</strong></p>
        <p style="margin: 8px 0 0; font-size: 18px; color: #0B1F3A; font-weight: bold;">Amount Due: $${total.toFixed(2)}</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 18px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0;">Born on the world's biggest stage. Now serving Dallas-Fort Worth.</p>
      <p style="margin: 4px 0 0;">First Eleven Cleaners • Dallas, TX • commercial@firstelevencleaners.com</p>
    </div>
  </div>
</body>
</html>
  `;
}
