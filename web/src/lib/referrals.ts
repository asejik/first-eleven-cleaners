import { randomInt } from 'node:crypto';
import type { createAdminClient } from '@/lib/supabase/admin';
import { getAppBaseUrl } from '@/lib/constants';
import { greetingFirstName } from '@/lib/sanitize';
import { sendContactMessage } from '@/lib/messaging/contact';
import { reportError } from '@/lib/error-reporting';

/**
 * Referrals and account credit (client 2026-10-10): Give $15 / Get $15. Everyone has a personal
 * code and link in their account. A new customer gets $15 off their first order (the order
 * minimum still applies); the referrer gets $15 of account credit when that order is
 * delivered. Members included. Account credit (referral rewards, Make It Right) is money, not
 * a promo: it applies to members too, and is used up when intake charges the next order.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const REFERRAL_AMOUNT = 15;
export const REFERRAL_PATH = '/r';

/** Letters only from the first name (up to 6), then 4 characters that can't be misread. */
export function makeReferralCode(fullName: string | null | undefined): string {
  const name = String(fullName ?? '')
    .split(/\s+/)[0]
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 6) || 'F11';
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let tail = '';
  for (let i = 0; i < 4; i++) tail += alphabet[randomInt(alphabet.length)];
  return `${name}${tail}`;
}

export function normalizeReferralCode(code: string | null | undefined): string {
  return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
}

export function referralLink(code: string): string {
  return `${getAppBaseUrl()}${REFERRAL_PATH}/${code}`;
}

/** The customer's code, made the first time they look. */
export async function getOrCreateReferralCode(supabase: AdminClient, customer: { id: string; full_name?: string | null }): Promise<string> {
  const { data: existing } = await supabase.from('referral_codes').select('code').eq('customer_id', customer.id).maybeSingle();
  if (existing?.code) return existing.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeReferralCode(customer.full_name);
    const { error } = await supabase.from('referral_codes').insert({ customer_id: customer.id, code });
    if (!error) return code;
    // Someone else's code, or this customer's made a moment ago
    const { data: again } = await supabase.from('referral_codes').select('code').eq('customer_id', customer.id).maybeSingle();
    if (again?.code) return again.code;
  }
  throw new Error('Could not make a referral code');
}

/** The customer whose code this is, if any. */
export async function referrerForCode(supabase: AdminClient, rawCode: string): Promise<{ customerId: string; code: string } | null> {
  const code = normalizeReferralCode(rawCode);
  if (code.length < 4) return null;
  const { data } = await supabase.from('referral_codes').select('customer_id, code').eq('code', code).maybeSingle();
  return data ? { customerId: data.customer_id, code: data.code } : null;
}

/**
 * Can this booking use a friend's code? Only a new customer (no order that went ahead or is
 * booked, and never referred before), and never their own code.
 */
export async function checkReferralForBooking(
  supabase: AdminClient,
  rawCode: string,
  booker: { customerId: string | null; email: string }
): Promise<{ ok: true; referrerId: string; code: string } | { ok: false; error: string }> {
  const referrer = await referrerForCode(supabase, rawCode);
  if (!referrer) return { ok: false, error: "That referral code wasn't found. Please check it and try again." };
  if (booker.customerId && booker.customerId === referrer.customerId) return { ok: false, error: "You can't use your own referral code. Share it with a friend instead." };
  const { data: referrerRow } = await supabase.from('customers').select('email').eq('id', referrer.customerId).maybeSingle();
  if (referrerRow?.email && referrerRow.email.toLowerCase() === booker.email.trim().toLowerCase()) {
    return { ok: false, error: "You can't use your own referral code. Share it with a friend instead." };
  }
  if (booker.customerId) {
    const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', booker.customerId).neq('status', 'cancelled');
    if ((count ?? 0) > 0) return { ok: false, error: 'Referral codes are for a first order. Welcome back!' };
    const { data: referred } = await supabase.from('referrals').select('status').eq('referred_customer_id', booker.customerId).maybeSingle();
    if (referred && referred.status !== 'pending') return { ok: false, error: 'Referral codes are for a first order. Welcome back!' };
  }
  return { ok: true, referrerId: referrer.customerId, code: referrer.code };
}

/** Records the referral on the new customer's first order (once per new customer). */
export async function recordReferral(supabase: AdminClient, r: { referrerId: string; referredId: string; orderId: string; code: string }): Promise<void> {
  const { error } = await supabase
    .from('referrals')
    .upsert(
      { referrer_customer_id: r.referrerId, referred_customer_id: r.referredId, referred_order_id: r.orderId, code: r.code, status: 'pending' },
      { onConflict: 'referred_customer_id' }
    );
  if (error) reportError('referrals/record', error, { details: `Order ${r.orderId}: referral not recorded` });
}

/** Account credit available: grants minus what has been used. */
export async function creditBalance(supabase: AdminClient, customerId: string): Promise<number> {
  const { data } = await supabase.from('customer_credits').select('amount').eq('customer_id', customerId).limit(1000);
  const cents = (data || []).reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
  return Math.max(0, cents) / 100;
}

/**
 * The referrer's $15 when the referred first order is delivered. Once per referral (a unique
 * index guards a second grant). Tells the referrer.
 */
export async function rewardReferralForDeliveredOrder(supabase: AdminClient, orderId: string): Promise<boolean> {
  const { data: referral } = await supabase
    .from('referrals')
    .select('id, referrer_customer_id, referred_customer_id, status')
    .eq('referred_order_id', orderId)
    .maybeSingle();
  if (!referral || referral.status !== 'pending') return false;
  const { error } = await supabase.from('customer_credits').insert({
    customer_id: referral.referrer_customer_id,
    amount: REFERRAL_AMOUNT,
    reason: 'referral_reward',
    referral_id: referral.id,
    order_id: orderId,
    note: 'A friend you referred had their first order delivered',
    created_by: 'Referral',
  });
  if (error) return false; // already granted
  await supabase.from('referrals').update({ status: 'rewarded', rewarded_at: new Date().toISOString() }).eq('id', referral.id);

  const { data: referrer } = await supabase.from('customers').select('full_name, phone, email, sms_consent').eq('id', referral.referrer_customer_id).maybeSingle();
  if (referrer) {
    const sent = await sendContactMessage({
      phone: referrer.phone,
      email: referrer.email,
      smsConsent: Boolean(referrer.sms_consent),
      title: `You've earned $${REFERRAL_AMOUNT} credit`,
      body: `First Eleven Cleaners: Thanks, ${greetingFirstName(referrer.full_name, 'there')}! A friend you referred just had their first order delivered, so $${REFERRAL_AMOUNT} of credit is on your account. It comes off your next order automatically.`,
    });
    if (!sent.ok) reportError('referrals/notify', sent.error, { details: `Referral ${referral.id}: reward message not sent` });
  }
  return true;
}

/**
 * Uses the customer's credit on an order being charged at intake: returns how much to take
 * off. Recorded once per order (a unique index guards a second use).
 */
export async function applyCreditToOrder(supabase: AdminClient, customerId: string, orderId: string, total: number): Promise<number> {
  const { data: used } = await supabase.from('customer_credits').select('amount').eq('order_id', orderId).eq('reason', 'used').maybeSingle();
  if (used) return Math.abs(Number(used.amount));
  const balance = await creditBalance(supabase, customerId);
  const apply = Math.min(balance, Math.max(0, total));
  if (apply <= 0) return 0;
  const { error } = await supabase.from('customer_credits').insert({
    customer_id: customerId,
    amount: -apply,
    reason: 'used',
    order_id: orderId,
    note: 'Used on this order at intake',
    created_by: 'Intake',
  });
  if (error) return 0;
  return apply;
}
