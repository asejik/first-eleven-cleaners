import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/resend';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { recipient_email, customer_name = 'Valued Customer' } = body;

    if (!recipient_email) {
      return NextResponse.json({ error: 'recipient_email is required.' }, { status: 400 });
    }

    const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>First Eleven Cleaners — Match-Ready Welcome</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0B1F3A; margin: 0; padding: 32px 16px;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3); border: 2px solid #C9A14A;">
    
    <!-- Top Gold Accent Bar -->
    <div style="background-color: #0B1F3A; padding: 28px 24px; text-align: center; border-bottom: 3px solid #C9A14A;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 2px;">FIRST ELEVEN CLEANERS</h1>
      <p style="color: #C9A14A; margin: 6px 0 0; font-size: 13px; font-weight: bold; text-transform: uppercase;">
        Dallas-Fort Worth Metroplex • FIFA 2026 Heritage Standard
      </p>
    </div>

    <!-- Body -->
    <div style="padding: 32px 28px;">
      <h2 style="color: #0B1F3A; margin: 0 0 12px; font-size: 20px;">Welcome to the Starting Lineup, ${customer_name}! ⚽</h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
        This email confirms that your <strong>Resend Transactional Email API integration</strong> is live and operating at 100% efficiency.
      </p>

      <div style="background-color: #f8fafc; border-left: 4px solid #C9A14A; padding: 16px; border-radius: 6px; margin-bottom: 24px;">
        <h4 style="margin: 0 0 6px; color: #0B1F3A; font-size: 14px;">🌟 Match-Ready Service Features:</h4>
        <ul style="margin: 0; padding-left: 18px; color: #475569; font-size: 13px; line-height: 1.6;">
          <li>48-Hour Standard Turnaround across DFW</li>
          <li>Digital Photo Intake Passports before charging</li>
          <li>AI Concierge (Eleven) 24/7 Wardrobe Memory</li>
          <li>Corporate Enterprise Net Terms & Itemized Statements</li>
        </ul>
      </div>

      <div style="text-align: center; margin: 28px 0 10px;">
        <a href="http://localhost:3000/dashboard" style="background-color: #C9A14A; color: #0B1F3A; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
          Open Customer Portal →
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
      <p style="margin: 0;">Born on the world's biggest stage. Now serving yours.</p>
      <p style="margin: 4px 0 0;">First Eleven Cleaners • Dallas, TX • concierge@firstelevencleaners.com</p>
    </div>

  </div>
</body>
</html>
    `;

    const result = await sendEmail({
      to: recipient_email,
      subject: `⚽ Welcome to First Eleven Cleaners — Match-Ready Email Confirmation`,
      html: testHtml,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      id: result.id,
      message: `Test email successfully dispatched to ${recipient_email} via Resend.`,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
