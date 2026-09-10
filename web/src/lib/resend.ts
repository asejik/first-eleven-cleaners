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
      <p style="margin: 0; font-weight: 600; color: #0B1F3A;">Every Garment Makes the Lineup.</p>
      <p style="margin: 4px 0 0;">First Eleven Cleaners • Dallas-Fort Worth, TX • commercial@firstelevencleaners.com</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Branded Welcome Email HTML Template for New Account Registrations
 */
export function buildWelcomeEmailHtml({
  name,
  promoCode = 'KICKOFF15',
  discountPercent = 15,
}: {
  name: string;
  promoCode?: string;
  discountPercent?: number;
}): string {
  const firstName = name.split(' ')[0] || 'there';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Welcome to First Eleven Cleaners</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.05);">
    
    <!-- Header -->
    <div style="background-color: #0B1F3A; padding: 28px; text-align: center; border-bottom: 3px solid #C9A14A;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px;">FIRST ELEVEN CLEANERS</h1>
      <p style="color: #C9A14A; margin: 6px 0 0; font-size: 13px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Every Garment Makes the Lineup.</p>
    </div>

    <!-- Body -->
    <div style="padding: 32px 28px;">
      <h2 style="color: #0B1F3A; margin: 0 0 16px; font-size: 20px;">Welcome to the Starting Lineup, ${firstName}!</h2>
      
      <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
        Thank you for creating an account with First Eleven Cleaners. We are proud to bring premier, AI-augmented dry cleaning, wash &amp; fold, and doorstep pickup &amp; delivery to homes and businesses across the Dallas-Fort Worth Metroplex.
      </p>

      <!-- Promo Box -->
      <div style="background-color: #fef9ee; border: 2px dashed #C9A14A; border-radius: 10px; padding: 20px; text-align: center; margin: 24px 0;">
        <p style="margin: 0; font-size: 13px; color: #854d0e; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Your New Customer Kickoff Gift</p>
        <p style="margin: 8px 0 4px; font-size: 24px; font-weight: 800; color: #0B1F3A; letter-spacing: 2px;">${promoCode}</p>
        <p style="margin: 0; font-size: 14px; color: #475569;">Take <strong>${discountPercent}% OFF</strong> your first order at checkout.</p>
      </div>

      <!-- What to Expect -->
      <h3 style="color: #0B1F3A; font-size: 16px; margin: 24px 0 12px;">What sets First Eleven apart:</h3>
      <ul style="color: #475569; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0 0 24px;">
        <li><strong>See It, Then Pay It:</strong> Transparent pricing with itemized photos before your card is charged.</li>
        <li><strong>Garment Passport:</strong> Studio intake photos &amp; condition tracking for every piece.</li>
        <li><strong>48-Hour Turnaround:</strong> Door-to-door morning and evening pickup windows across DFW.</li>
        <li><strong>100% Make It Right Guarantee:</strong> One-tap claims on every receipt — we make it right.</li>
      </ul>

      <!-- CTA -->
      <div style="text-align: center; margin: 32px 0 16px;">
        <a href="https://firstelevencleaners.com/book" style="background-color: #0B1F3A; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
          Schedule Your First Pickup &rarr;
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; font-weight: 600; color: #0B1F3A;">Every Garment Makes the Lineup.</p>
      <p style="margin: 4px 0 0;">First Eleven Cleaners • Dallas-Fort Worth, TX • Phone: (214) 555-0111</p>
      <p style="margin: 4px 0 0;">Questions? Reply directly to this email or reach us at <a href="mailto:support@firstelevencleaners.com" style="color: #C9A14A; text-decoration: none;">support@firstelevencleaners.com</a></p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Branded Order Stage Notification Email Template
 */
export function buildStageNotificationEmailHtml({
  stageTitle,
  customerName,
  orderNumber,
  messageBody,
  pickupDate,
  pickupWindow,
  deliveryDate,
  deliveryWindow,
  total,
  trackingUrl,
}: {
  stageTitle: string;
  customerName: string;
  orderNumber: string;
  messageBody: string;
  pickupDate?: string;
  pickupWindow?: string;
  deliveryDate?: string;
  deliveryWindow?: string | null;
  total?: number;
  trackingUrl: string;
}): string {
  const firstName = customerName.split(' ')[0] || 'Valued Customer';
  const pWindow = pickupWindow === 'morning' ? 'Morning (7:30–10:00 AM)' : pickupWindow === 'evening' ? 'Evening (5:00–8:00 PM)' : (pickupWindow || '');
  const dWindow = deliveryWindow === 'morning' ? 'Morning (7:30–10:00 AM)' : deliveryWindow === 'evening' ? 'Evening (5:00–8:00 PM)' : (deliveryWindow || '');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${stageTitle} - Order #${orderNumber}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.05);">
    
    <!-- Header -->
    <div style="background-color: #0B1F3A; padding: 24px 28px; text-align: center; border-bottom: 3px solid #C9A14A;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 1px;">FIRST ELEVEN CLEANERS</h1>
      <p style="color: #C9A14A; margin: 4px 0 0; font-size: 12px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Every Garment Makes the Lineup.</p>
    </div>

    <!-- Body -->
    <div style="padding: 32px 28px;">
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
        <h2 style="color: #166534; margin: 0; font-size: 18px;">${stageTitle}</h2>
      </div>

      <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Hi ${firstName}, here is the latest update on your Order <strong>#${orderNumber}</strong>:
      </p>

      <div style="background-color: #f8fafc; border-left: 4px solid #0B1F3A; padding: 14px 18px; margin: 16px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; color: #1e293b; font-size: 15px; line-height: 1.5;">${messageBody}</p>
      </div>

      <!-- Details Summary -->
      <table style="width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 14px;">
        ${pickupDate ? `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 0; color: #64748b;">Pickup Window:</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">${pickupDate} ${pWindow ? `(${pWindow})` : ''}</td>
        </tr>` : ''}
        ${deliveryDate ? `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 0; color: #64748b;">Estimated Delivery:</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">${deliveryDate} ${dWindow ? `(${dWindow})` : ''}</td>
        </tr>` : ''}
        ${total !== undefined ? `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 0; color: #64748b;">Order Total:</td>
          <td style="padding: 10px 0; color: #0B1F3A; font-weight: 700; text-align: right; font-size: 16px;">$${total.toFixed(2)}</td>
        </tr>` : ''}
      </table>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 28px 0 16px;">
        <a href="${trackingUrl}" style="background-color: #0B1F3A; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
          Track Your Order Live &rarr;
        </a>
      </div>

      <p style="font-size: 13px; color: #94a3b8; text-align: center; margin: 16px 0 0;">
        Backed by our 100% Make It Right Guarantee.
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; font-weight: 600; color: #0B1F3A;">Every Garment Makes the Lineup.</p>
      <p style="margin: 4px 0 0;">First Eleven Cleaners • Dallas-Fort Worth, TX • Phone: (214) 555-0111</p>
      <p style="margin: 4px 0 0;">Support: <a href="mailto:support@firstelevencleaners.com" style="color: #C9A14A; text-decoration: none;">support@firstelevencleaners.com</a></p>
    </div>
  </div>
</body>
</html>
  `;
}
