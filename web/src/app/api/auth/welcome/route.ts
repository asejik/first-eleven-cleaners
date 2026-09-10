import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail, buildWelcomeEmailHtml } from '@/lib/resend';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

const WelcomeSchema = z.object({
  name: z.string().min(1).default('Valued Customer'),
  email: z.string().email(),
});

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit(`welcome_email:${clientIp}`, 30, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    const raw = await request.json();
    const { name, email } = WelcomeSchema.parse(raw);

    const html = buildWelcomeEmailHtml({ name });

    const result = await sendEmail({
      to: email,
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
