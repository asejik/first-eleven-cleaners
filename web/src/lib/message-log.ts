import type { createAdminClient } from '@/lib/supabase/admin';

/**
 * Message history (P03 PR-26). Each SMS, notification, reply or escalation is one row in
 * `messages`, written with a single insert, so simultaneous messages can't overwrite each
 * other. (It used to be one growing JSON array per customer in `conversations`.)
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export type MessageChannel = 'web' | 'sms' | 'whatsapp';

export interface MessageLogEntry {
  customerId: string;
  channel: MessageChannel;
  direction: 'inbound' | 'outbound';
  body: string;
  orderId?: string | null;
  stage?: string | null;
  mediaUrl?: string | null;
  mode?: string | null;
  externalId?: string | null;
  from?: string | null;
  to?: string | null;
  createdAt?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Saves messages; never throws (a logging failure must not stop the message itself). */
export async function logMessages(supabase: AdminClient, entries: MessageLogEntry[]): Promise<boolean> {
  if (entries.length === 0) return true;
  try {
    const { error } = await supabase.from('messages').insert(
      entries.map((e) => ({
        customer_id: e.customerId,
        channel: e.channel,
        direction: e.direction,
        body: e.body,
        order_id: e.orderId && UUID_RE.test(e.orderId) ? e.orderId : null,
        stage: e.stage ?? null,
        media_url: e.mediaUrl ?? null,
        mode: e.mode ?? null,
        external_id: e.externalId ?? null,
        from_address: e.from ?? null,
        to_address: e.to ?? null,
        ...(e.createdAt ? { created_at: e.createdAt } : {}),
      }))
    );
    if (error) {
      console.warn('[Messages] Could not save message history:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Messages] Could not save message history:', err);
    return false;
  }
}

/** The customer's latest messages on a channel, oldest first. */
export async function recentMessages(
  supabase: AdminClient,
  customerId: string,
  channel: MessageChannel,
  limit: number
): Promise<Array<{ direction: 'inbound' | 'outbound'; body: string }>> {
  const { data, error } = await supabase
    .from('messages')
    .select('direction, body, created_at')
    .eq('customer_id', customerId)
    .eq('channel', channel)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as Array<{ direction: 'inbound' | 'outbound'; body: string }>).reverse();
}
