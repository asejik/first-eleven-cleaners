import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';
import { getAppBaseUrl } from '@/lib/constants';
import { reportError } from '@/lib/error-reporting';
import { BOOKED_WITHIN_DAYS, mergeMessageTests, textFor, variantFor, TESTED_MESSAGES, type MessageTests, type TestedMessageKey } from '@/lib/message-tests';

/**
 * The A/B message tests' database side (client 2026-10-14). Server only. The tests are
 * app_settings 'message_tests' (one-minute cache); every tested message sent is a
 * message_sends row, its link goes through /m/<id> (the tap), and a booking by that customer
 * within 7 days is credited to the latest one. A failure here never stops a message: it goes
 * out as version A with its plain link.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

const SETTINGS_KEY = 'message_tests';
const CACHE_MS = 60_000;
let cache: { at: number; tests: MessageTests } | null = null;

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function getMessageTests(): Promise<MessageTests> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.tests;
  let tests: MessageTests = {};
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await createAdminClient().from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
      if (error) throw error;
      tests = mergeMessageTests(data?.value);
    } catch (err) {
      reportError('message-tests', err, { details: 'Could not read the message tests; sending version A' });
    }
  }
  cache = { at: Date.now(), tests };
  return tests;
}

export function resetMessageTestsCache(): void {
  cache = null;
}

export async function saveMessageTests(tests: MessageTests, updatedBy: string): Promise<void> {
  const { error } = await createAdminClient()
    .from('app_settings')
    .upsert({ key: SETTINGS_KEY, value: tests as unknown as Json, updated_at: new Date().toISOString(), updated_by: updatedBy });
  if (error) throw error;
  cache = { at: Date.now(), tests };
}

export const TAP_PATH = '/m';

export interface PickedMessage {
  variant: 'A' | 'B';
  text: string;
  /** The tracked link to put in the text (or the plain one when tracking failed) */
  link: string | undefined;
  sendId: string | null;
}

/**
 * Picks this recipient's version of a message and records the send. `recipient` is the
 * customer id when there is one (else an email or phone), so they always get the same version.
 */
export async function pickMessage(
  supabase: AdminClient,
  {
    key,
    recipient,
    customerId,
    orderId,
    targetUrl,
    zone5A,
  }: { key: TestedMessageKey; recipient: string; customerId?: string | null; orderId?: string | null; targetUrl?: string; zone5A?: string }
): Promise<PickedMessage> {
  const tests = await getMessageTests();
  const test = tests[key];
  const variant = variantFor(recipient, key, test);
  const text = textFor(key, variant, test, zone5A);
  try {
    const { data, error } = await supabase
      .from('message_sends')
      .insert({ message_key: key, variant, customer_id: customerId ?? null, order_id: orderId ?? null, target_url: targetUrl ?? null })
      .select('id')
      .single();
    if (error || !data) throw error || new Error('No send recorded');
    return { variant, text, link: targetUrl ? `${getAppBaseUrl()}${TAP_PATH}/${data.id}` : undefined, sendId: data.id };
  } catch (err) {
    reportError('message-tests', err, { details: `${key}: send not recorded; plain link used` });
    return { variant, text, link: targetUrl, sendId: null };
  }
}

/** After sending: which channel it went by (sms, email), or none. */
export async function recordSendChannel(supabase: AdminClient, sendId: string | null, channel: string | null | undefined): Promise<void> {
  if (!sendId) return;
  try {
    await supabase.from('message_sends').update({ channel: String(channel || 'none').slice(0, 10) }).eq('id', sendId);
  } catch (err) {
    reportError('message-tests', err, { details: `Send ${sendId}: channel not recorded` });
  }
}

/** A tap on /m/<id>: counted, and where it leads. */
export async function recordTap(supabase: AdminClient, sendId: string, now: Date = new Date()): Promise<string | null> {
  const { data: send } = await supabase.from('message_sends').select('id, target_url, tapped_at, tap_count').eq('id', sendId).maybeSingle();
  if (!send?.target_url) return null;
  await supabase
    .from('message_sends')
    .update({ tapped_at: send.tapped_at ?? now.toISOString(), tap_count: (send.tap_count || 0) + 1 })
    .eq('id', sendId);
  return send.target_url;
}

/** A booking: credited to the customer's latest tested message from the last 7 days not yet credited. */
export async function recordBookingForMessages(supabase: AdminClient, customerId: string, orderId: string, now: Date = new Date()): Promise<void> {
  try {
    const since = new Date(now.getTime() - BOOKED_WITHIN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: sends } = await supabase
      .from('message_sends')
      .select('id')
      .eq('customer_id', customerId)
      .is('booked_order_id', null)
      .gte('sent_at', since)
      .order('sent_at', { ascending: false })
      .limit(1);
    const latest = sends?.[0];
    if (!latest) return;
    await supabase.from('message_sends').update({ booked_order_id: orderId, booked_at: now.toISOString() }).eq('id', latest.id).is('booked_order_id', null);
  } catch (err) {
    reportError('message-tests', err, { details: `Order ${orderId}: booking not credited to a message` });
  }
}

export interface VariantStats {
  sent: number;
  tapped: number;
  booked: number;
}

/** Sends, taps and bookings per version of each message, since its count started. */
export async function messageTestStats(supabase: AdminClient, tests: MessageTests): Promise<Record<string, { A: VariantStats; B: VariantStats }>> {
  const out: Record<string, { A: VariantStats; B: VariantStats }> = {};
  for (const info of TESTED_MESSAGES) {
    const blank = (): VariantStats => ({ sent: 0, tapped: 0, booked: 0 });
    out[info.key] = { A: blank(), B: blank() };
    let query = supabase.from('message_sends').select('variant, tapped_at, booked_order_id').eq('message_key', info.key);
    const from = tests[info.key]?.countFrom;
    if (from) query = query.gte('sent_at', from);
    const { data } = await query.limit(20000);
    for (const row of data || []) {
      const v = out[info.key][row.variant === 'B' ? 'B' : 'A'];
      v.sent += 1;
      if (row.tapped_at) v.tapped += 1;
      if (row.booked_order_id) v.booked += 1;
    }
  }
  return out;
}
