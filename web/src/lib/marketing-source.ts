import { createHmac } from 'node:crypto';
import type { createAdminClient } from '@/lib/supabase/admin';
import { reportError } from '@/lib/error-reporting';

/**
 * The van wrap (client 2026-10-23): everyone who finds us through the van is VAN-01. The QR
 * code opens /van?via=qr, the PICKUP text reply links /van?via=text, and the address typed
 * from the van is plain /van ('typed'). The van page sets a 60-day cookie holding the first
 * van visit (kept while the visitor looks at other pages); the booking reads it on the server.
 * A booking from a phone that texted PICKUP in the last 60 days counts too, so a link opened
 * in another browser isn't lost. Phone numbers are kept only as a keyed hash.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const VAN_SOURCE = 'VAN-01';
export const MARKETING_CHANNELS = ['qr', 'text', 'typed'] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];
export type MarketingEvent = 'visit' | 'book_click' | 'text_in';
export interface Attribution {
  source: string;
  channel: MarketingChannel;
}

export const SOURCE_COOKIE = 'fe_src';
export const SOURCE_COOKIE_DAYS = 60;
export const TEXT_MATCH_DAYS = 60;

export const CHANNEL_LABELS: Record<MarketingChannel, string> = {
  qr: 'QR code',
  text: 'PICKUP text link',
  typed: 'Typed the address',
};

/** ?via=qr / ?via=text; anything else (or nothing) is the address typed in */
export function channelFromVia(via: string | null | undefined): MarketingChannel {
  const v = String(via ?? '').trim().toLowerCase();
  return v === 'qr' || v === 'text' ? v : 'typed';
}

const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function sourceCookieValue(channel: MarketingChannel, visitorId: string): string {
  return `${VAN_SOURCE}.${channel}.${visitorId}`;
}

export function parseSourceCookie(raw: string | null | undefined): (Attribution & { visitorId: string }) | null {
  const [source, channel, visitorId] = String(raw ?? '').split('.');
  if (source !== VAN_SOURCE) return null;
  if (!(MARKETING_CHANNELS as readonly string[]).includes(channel)) return null;
  if (!VISITOR_ID.test(visitorId ?? '')) return null;
  return { source, channel: channel as MarketingChannel, visitorId };
}

/** The van cookie from a request's Cookie header, if it holds a valid one */
export function sourceFromCookieHeader(header: string | null | undefined) {
  for (const part of String(header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== SOURCE_COOKIE) continue;
    return parseSourceCookie(decodeURIComponent(part.slice(at + 1).trim()));
  }
  return null;
}

/** A PICKUP text's visitor id: a keyed hash of the number, so the number itself isn't stored */
export function phoneVisitorId(e164: string): string {
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-dev-pepper';
  return `sms:${createHmac('sha256', pepper).update(`van-text:${e164}`).digest('hex').slice(0, 40)}`;
}

/** "PICKUP", "pickup", "Pickup!" */
export const isPickupKeyword = (body: string) => /^pickup[.!]*$/i.test(body.trim());

/**
 * The automatic reply to PICKUP (the client's wording). It's a single reply to a text they
 * sent, so it doesn't sign them up for anything; the opt-out line is still included.
 */
export function pickupReply(baseUrl: string): string {
  return (
    'Welcome to First Eleven Cleaners! Thanks for reaching out. We offer professional laundry, dry cleaning, and pickup & delivery across DFW. ' +
    `Schedule your first pickup here: ${baseUrl}/van?via=text Reply STOP to opt out. Msg & data rates may apply.`
  );
}

export async function recordMarketingEvent(
  supabase: AdminClient,
  { channel, event, visitorId, now = new Date() }: { channel: MarketingChannel; event: MarketingEvent; visitorId: string; now?: Date }
): Promise<void> {
  const { error } = await supabase
    .from('marketing_events')
    .insert({ source: VAN_SOURCE, channel, event, visitor_id: visitorId, created_at: now.toISOString() });
  if (error) reportError('marketing-source', error, { details: `Van ${event} (${channel}) not recorded` });
}

/** Where a booking came from: the van cookie, else a PICKUP text from this phone in the last 60 days */
export async function bookingAttribution(
  supabase: AdminClient,
  { cookieHeader, phoneE164, now = new Date() }: { cookieHeader: string | null; phoneE164: string | null; now?: Date }
): Promise<Attribution | null> {
  const cookie = sourceFromCookieHeader(cookieHeader);
  if (cookie) return { source: cookie.source, channel: cookie.channel };
  if (!phoneE164) return null;
  const since = new Date(now.getTime() - TEXT_MATCH_DAYS * 86_400_000).toISOString();
  const { data } = await supabase
    .from('marketing_events')
    .select('id')
    .eq('visitor_id', phoneVisitorId(phoneE164))
    .eq('event', 'text_in')
    .gte('created_at', since)
    .limit(1);
  return data && data.length > 0 ? { source: VAN_SOURCE, channel: 'text' } : null;
}

/**
 * Stamps the source on the order, and on the customer when this is their first order (nothing
 * earlier that wasn't cancelled) and they have none yet: a customer who already used us isn't
 * a new customer from the van. Never blocks the booking.
 */
export async function stampMarketingSource(
  supabase: AdminClient,
  { attribution, customerId, orderId, now = new Date() }: { attribution: Attribution; customerId: string; orderId: string; now?: Date }
): Promise<void> {
  try {
    await supabase.from('orders').update({ marketing_source: attribution.source, marketing_channel: attribution.channel }).eq('id', orderId);
    const { data: earlier } = await supabase
      .from('orders')
      .select('id')
      .eq('customer_id', customerId)
      .neq('id', orderId)
      .neq('status', 'cancelled')
      .limit(1);
    if (earlier && earlier.length > 0) return;
    await supabase
      .from('customers')
      .update({ marketing_source: attribution.source, marketing_channel: attribution.channel, marketing_source_at: now.toISOString() })
      .eq('id', customerId)
      .is('marketing_source', null);
  } catch (err) {
    reportError('marketing-source', err, { details: `Order ${orderId}: van source not stamped` });
  }
}
