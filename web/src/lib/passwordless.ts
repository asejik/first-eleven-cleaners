import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { createAdminClient } from '@/lib/supabase/admin';
import { toE164 } from '@/lib/phone';
import { sendSms } from '@/lib/messaging/contact';
import { sendEmail, buildSignInEmailHtml } from '@/lib/resend';
import { getAppBaseUrl } from '@/lib/constants';
import { reportError } from '@/lib/error-reporting';

/**
 * Passwordless sign-in (client 2026-10-08: "sign-in is a text code or magic link, no
 * password, no extra fields"). Customers only: staff and admins keep their passwords.
 * - Email link: to any customer email. Owning the inbox proves the account, so a guest who
 *   never made an account gets one silently (linked to their bookings by the email triggers).
 * - Text code: only to a phone the account owner proved with a code (customers.phone_verified_at).
 *   A guest booking can type any phone, so an unproven phone never signs anyone in.
 * Codes: 6 digits, HMAC-hashed, 10 minutes, 5 tries; a new code replaces the old one.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const CODE_TTL_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;
export type CodePurpose = 'sign_in' | 'verify_phone';

/** The same answer whether or not an account matched, so nobody can probe who is a customer. */
export const SENT_LINK_MESSAGE = 'If that email belongs to a First Eleven account, a sign-in link is on its way. It works for 1 hour.';
export const SENT_CODE_MESSAGE = 'If that number is verified for text sign-in, a 6-digit code is on its way. It works for 10 minutes.';
export const BAD_CODE_MESSAGE = 'That code is not right or has expired. Request a new one.';

function hashCode(customerId: string, code: string): string {
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-dev-pepper';
  return createHmac('sha256', pepper).update(`${customerId}:${code}`).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isEmailIdentifier(identifier: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());
}

type CustomerRow = { id: string; email: string; full_name: string; role: string; auth_id: string | null; phone: string | null };

/**
 * The customer's sign-in account: their own if linked, otherwise created (confirmed) now; the
 * signup trigger links it to the customer row with that email. Returns the auth email.
 */
async function ensureAuthUser(admin: AdminClient, customer: CustomerRow): Promise<string> {
  if (customer.auth_id) return customer.email;
  const { error } = await admin.auth.admin.createUser({
    email: customer.email,
    email_confirm: true,
    user_metadata: { full_name: customer.full_name },
  });
  // Already registered (e.g. signed up but never confirmed): the link below confirms it
  if (error && !/already|registered|exists/i.test(error.message)) throw error;
  return customer.email;
}

/** A one-time token for the account, to turn into a session (verifyOtp) or an email link. */
export async function magicLinkToken(admin: AdminClient, customer: CustomerRow): Promise<string> {
  const email = await ensureAuthUser(admin, customer);
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data?.properties?.hashed_token) throw error || new Error('No sign-in token returned');
  return data.properties.hashed_token;
}

/** Email link sign-in. Always resolves; sends only to a customer account. */
export async function sendSignInLink(admin: AdminClient, email: string): Promise<void> {
  const { data: customer } = await admin
    .from('customers')
    .select('id, email, full_name, role, auth_id, phone')
    // Exact match, any case (wildcards in the typed email are escaped)
    .ilike('email', email.trim().replace(/[\\%_]/g, (c) => `\\${c}`))
    .maybeSingle();
  if (!customer || customer.role !== 'customer') return;
  const token = await magicLinkToken(admin, customer);
  const link = `${getAppBaseUrl()}/auth/confirm?token_hash=${encodeURIComponent(token)}&type=magiclink`;
  const sent = await sendEmail({ to: customer.email, subject: 'Your First Eleven sign-in link', html: buildSignInEmailHtml({ name: customer.full_name, link }) });
  if (!sent.success) reportError('passwordless/link', sent.error, { details: 'Sign-in link email not sent' });
}

/** Creates a code (replacing any open one) and texts it. */
async function issueCode(admin: AdminClient, customerId: string, phone: string, purpose: CodePurpose): Promise<void> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await admin.from('sign_in_codes').update({ used_at: new Date().toISOString() }).eq('customer_id', customerId).eq('purpose', purpose).is('used_at', null);
  const { error } = await admin.from('sign_in_codes').insert({
    customer_id: customerId,
    purpose,
    phone,
    code_hash: hashCode(customerId, code),
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
  });
  if (error) throw error;
  const what = purpose === 'sign_in' ? 'sign-in' : 'phone verification';
  const sent = await sendSms(phone, `First Eleven Cleaners: your ${what} code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes. Never share it.`);
  if (!sent.ok) reportError('passwordless/code', sent.error, { details: `The ${what} code text was not sent` });
}

/** Text-code sign-in: only to a verified phone on a customer account. Always resolves. */
export async function sendSignInCode(admin: AdminClient, rawPhone: string): Promise<void> {
  const phone = toE164(rawPhone);
  if (!phone) return;
  const { data: customer } = await admin
    .from('customers')
    .select('id, role')
    .eq('phone', phone)
    .eq('role', 'customer')
    .not('phone_verified_at', 'is', null)
    .order('phone_verified_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!customer) return;
  await issueCode(admin, customer.id, phone, 'sign_in');
}

/** Checks a code (counting the try). Returns the customer id it was for, or null. */
export async function checkCode(admin: AdminClient, { phone, code, purpose, customerId }: { phone: string; code: string; purpose: CodePurpose; customerId?: string }): Promise<string | null> {
  let query = admin
    .from('sign_in_codes')
    .select('id, customer_id, code_hash, attempts')
    .eq('phone', phone)
    .eq('purpose', purpose)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString());
  if (customerId) query = query.eq('customer_id', customerId);
  const { data: row } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!row || row.attempts >= CODE_MAX_ATTEMPTS) return null;

  const matched = /^\d{6}$/.test(code) && sameHash(row.code_hash, hashCode(row.customer_id, code));
  const { data: claimed } = await admin
    .from('sign_in_codes')
    .update(matched ? { used_at: new Date().toISOString(), attempts: row.attempts + 1 } : { attempts: row.attempts + 1 })
    .eq('id', row.id)
    .is('used_at', null)
    .eq('attempts', row.attempts)
    .select('id');
  if (!matched || !claimed || claimed.length === 0) return null;
  return row.customer_id;
}

/** A signed-in customer proves their phone: text a code to the phone on their account. */
export async function sendPhoneVerificationCode(admin: AdminClient, customerId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: customer } = await admin.from('customers').select('id, phone, role').eq('id', customerId).maybeSingle();
  const phone = toE164(customer?.phone);
  if (!customer || !phone) return { ok: false, error: 'Add a mobile number to your details first.' };
  if (customer.role !== 'customer') return { ok: false, error: 'Text sign-in is for customer accounts.' };
  await issueCode(admin, customer.id, phone, 'verify_phone');
  return { ok: true };
}

/** Marks the phone verified when the code matches and the phone hasn't changed since. */
export async function confirmPhoneVerification(admin: AdminClient, customerId: string, code: string): Promise<boolean> {
  const { data: customer } = await admin.from('customers').select('phone').eq('id', customerId).maybeSingle();
  const phone = toE164(customer?.phone);
  if (!phone) return false;
  const matched = await checkCode(admin, { phone, code, purpose: 'verify_phone', customerId });
  if (!matched) return false;
  // Stored as E.164 (with the verification in the same update, so the trigger keeps it)
  const { error } = await admin.from('customers').update({ phone, phone_verified_at: new Date().toISOString() }).eq('id', customerId);
  if (error) throw error;
  return true;
}

export async function customerForSignIn(admin: AdminClient, customerId: string): Promise<CustomerRow | null> {
  const { data } = await admin.from('customers').select('id, email, full_name, role, auth_id, phone').eq('id', customerId).maybeSingle();
  return data && data.role === 'customer' ? data : null;
}
