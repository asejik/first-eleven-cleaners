import { SUPPORT_PHONE } from '@/lib/constants';

/**
 * Plain-language messages for Supabase Auth errors (P05 AR-11). Supabase's own text is
 * technical and English-only; customers get what happened and what to do next.
 */
export const PASSWORD_HINT = 'At least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol';

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'That email or password is incorrect. Please try again, or reset your password.',
  email_not_confirmed: 'Please confirm your email first. Check your inbox for the link we sent.',
  weak_password: `Please choose a stronger password: ${PASSWORD_HINT.charAt(0).toLowerCase()}${PASSWORD_HINT.slice(1)}.`,
  over_email_send_rate_limit: 'Too many emails have been sent to this address. Please wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
  same_password: 'Your new password must be different from your current one.',
  user_already_exists: 'An account already exists for this email. Please log in instead.',
  email_exists: 'An account already exists for this email. Please log in instead.',
  email_address_invalid: 'Please enter a valid email address.',
};

const FALLBACK = `Something went wrong. Please try again, or call us at ${SUPPORT_PHONE}.`;

/** A customer-facing message for an Auth error (or any thrown error). */
export function friendlyAuthError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  return MESSAGES[code] ?? FALLBACK;
}

/** Why a new password doesn't meet the project's rule, or null if it does. */
export function passwordProblem(password: string): string | null {
  const ok =
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
  return ok ? null : `Your password needs: ${PASSWORD_HINT.charAt(0).toLowerCase()}${PASSWORD_HINT.slice(1)}.`;
}
