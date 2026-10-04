import { z } from 'zod';

/**
 * Escapes text for safe insertion into HTML (email templates) (SEC-09).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * First name for "Hi {name}" greetings in emails and SMS (SEC-09). Keeps letters,
 * apostrophes and hyphens only, so a "name" can never carry a link or markup,
 * whatever its source (booking, signup metadata, staff edits).
 */
export function greetingFirstName(fullName: string | null | undefined, fallback = 'Valued Customer'): string {
  const first = String(fullName ?? '').trim().split(/\s+/)[0] || '';
  const cleaned = first.replace(/[^\p{L}\p{M}'’-]/gu, '').slice(0, 40);
  return /\p{L}/u.test(cleaned) ? cleaned : fallback;
}

/**
 * Server-side validation for person names (SEC-09): letters (any language), spaces,
 * hyphens and apostrophes; periods only when followed by a space ("J. R. Smith"),
 * which rules out domain names such as "evil.com".
 */
export const personNameSchema = z
  .string()
  .trim()
  .min(2, 'Please enter your full name.')
  .max(80, 'Name must be 80 characters or fewer.')
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u, 'Name can only contain letters, spaces, hyphens, apostrophes and periods.')
  .refine((value) => !/\.\S/.test(value), 'Please put a space after any period in your name.');
