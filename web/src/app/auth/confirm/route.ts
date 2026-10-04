import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { ROUTES } from '@/lib/constants';

const ALLOWED_TYPES: EmailOtpType[] = ['email', 'signup', 'recovery', 'email_change', 'magiclink', 'invite'];

/**
 * Handles links from Supabase auth emails (signup confirmation, password reset) (SEC-28).
 * The one-time token is verified server-side, which works in any browser or device, and
 * the session cookies are set on the response. Destinations are fixed (no open redirect).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');

  const supabase = await createClient();

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const destination = type === 'recovery' ? ROUTES.resetPassword : ROUTES.dashboard;
      return NextResponse.redirect(new URL(destination, request.url));
    }
    console.warn('Email link verification failed:', error.message);
  } else if (code) {
    // Default Supabase templates send a PKCE code; this only succeeds in the browser that
    // started the flow. The token_hash templates above work everywhere.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(ROUTES.dashboard, request.url));
    }
    console.warn('Email link code exchange failed:', error.message);
  }

  return NextResponse.redirect(new URL(`${ROUTES.login}?error=link_expired`, request.url));
}
