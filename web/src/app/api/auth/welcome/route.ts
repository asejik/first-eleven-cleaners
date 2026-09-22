import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail, buildWelcomeEmailHtml } from '@/lib/resend';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedCustomer } from '@/lib/supabase/auth-helpers';

const WelcomeSchema = z.object({
  name: z.string().min(1).default('Valued Customer'),
  email: z.string().email(),
});

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = await checkRateLimitAsync(`welcome_email_ip:${clientIp}`, 5, 10 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many welcome email requests. Please try again later.' },
        { status: 429 }
      );
    }

    const raw = await request.json();
    const { name, email } = WelcomeSchema.parse(raw);
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Anti-Spam Relay: Restrict to registered customers only (SEC-008)
    const supabase = createAdminClient();
    const { data: customer } = await supabase
      .from('customers')
      .select('id, email, created_at')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (!customer) {
      return NextResponse.json(
        { error: 'No registered customer account found for this email address.' },
        { status: 404 }
      );
    }

    // 2. Ownership & Recency verification (SEC-008)
    const { user } = await getAuthenticatedCustomer(request);
    const isSessionMatch = Boolean(user && user.email?.toLowerCase() === normalizedEmail);

    const accountAgeMs = Date.now() - new Date(customer.created_at).getTime();
    const isRecentSignup = accountAgeMs >= 0 && accountAgeMs <= 15 * 60 * 1000;

    if (!isSessionMatch && !isRecentSignup) {
      return NextResponse.json(
        {
          error:
            'Forbidden: Welcome emails can only be requested upon recent account registration or with an active authenticated session.',
        },
        { status: 403 }
      );
    }

    // 3. Per-recipient rate limiting: Maximum 1 welcome email per 24 hours (SEC-008)
    const recipientRateCheck = await checkRateLimitAsync(
      `welcome_email_to:${normalizedEmail}`,
      1,
      24 * 60 * 60 * 1000
    );
    if (!recipientRateCheck.allowed) {
      return NextResponse.json(
        { error: 'A welcome email has already been dispatched to this account.' },
        { status: 429 }
      );
    }

    const html = buildWelcomeEmailHtml({ name });

    const result = await sendEmail({
      to: normalizedEmail,
      subject: 'Welcome to the Starting Lineup | First Eleven Cleaners',
      html,
    });

    if (!result.success) {
      console.warn('Welcome email delivery note:', result.error);
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, messageId: result.id });
  } catch (err: unknown) {
    console.error('Welcome email error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Invalid request payload' },
      { status: 400 }
    );
  }
}
