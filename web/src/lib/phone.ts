import { z } from 'zod';

/**
 * Phone numbers in one format: E.164 ("+12145550100") (P03 PR-18).
 *
 * Twilio requires E.164, and STOP/START matching only works when every stored number has
 * the same format. 10-digit numbers (and 11-digit numbers starting with 1) are treated as
 * US/Canada; numbers typed with a leading "+" keep their own country code.
 * The database applies the same rule (normalize_phone_e164 trigger on customers).
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (trimmed.startsWith('+')) {
    if (digits.startsWith('1')) return digits.length === 11 ? `+${digits}` : null;
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

const INVALID_PHONE_MESSAGE =
  'Please enter a valid mobile number, e.g. (214) 555-0100, or include the country code, e.g. +44 20 7946 0958.';

/** Zod field: accepts any common format, stores E.164. */
export const phoneSchema = z
  .string()
  .trim()
  .refine((value) => toE164(value) !== null, INVALID_PHONE_MESSAGE)
  .transform((value) => toE164(value) as string);
