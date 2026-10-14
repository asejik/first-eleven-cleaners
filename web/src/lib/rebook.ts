import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';
import { addDaysToDate, texasDate } from '@/lib/texas-time';
import { holdAmountFor } from '@/lib/payment-hold';
import { computeBookingFinancials, extendedReachFee, getAppBaseUrl, orderMinimumGap } from '@/lib/constants';
import { earliestExtendedReachRun, formatLongDate, nextZoneRouteDay, zoneDeliveryDate, type Coverage } from '@/lib/coverage';
import { earliestPickupDate, validateSchedule, BOOKING_WINDOW_CAPACITY } from '@/lib/schedule';
import { notifyOrderCustomer } from '@/lib/daily-jobs';
import { windowText } from '@/lib/routine';
import { getOpenMembership, zoneForTemplate } from '@/lib/routine-store';
import { isOrderTwo, earlierPickups, ORDER_TWO_DISCOUNT } from '@/lib/order-two';
import { fillMessage } from '@/lib/message-tests';
import { pickMessage, recordBookingForMessages } from '@/lib/message-tests-store';

/**
 * One-tap rebook (client 2026-10-14): "Delivered text gets a one-tap rebook: 'Book next week's
 * pickup?' with their last window pre-filled. One tap = booked." The text links a page with
 * one "Book it" button (a link alone never books: phones and chat apps open links to preview
 * them). It books the same weekday next week (Zone 5: the next open run), the same window and
 * address, estimated from the last order's items, on the card already on file; the usual hold
 * is placed 2 days before. Anything that can't be one tap (no card, a member, too small, the
 * window full, an old link) goes to normal booking instead.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const REBOOK_PATH = '/rebook';
/** A rebook link works for 14 days. */
export const REBOOK_LINK_DAYS = 14;

const day = (date: string) => date.replace(/-/g, '');

function signature(orderId: string, issued: string): string {
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-dev-pepper';
  return createHmac('sha256', pepper).update(`rebook:${orderId}:${issued}`).digest('hex').slice(0, 24);
}

/** The link's token: the order, the day it was sent, and a signature. */
export function rebookToken(orderId: string, now: Date = new Date()): string {
  const issued = day(texasDate(now));
  return `${orderId}.${issued}.${signature(orderId, issued)}`;
}

export function rebookUrl(orderId: string, now: Date = new Date()): string {
  return `${getAppBaseUrl()}${REBOOK_PATH}/${rebookToken(orderId, now)}`;
}

export type TokenCheck = { ok: true; orderId: string } | { ok: false; reason: 'invalid' | 'expired' };

export function readRebookToken(token: string, now: Date = new Date()): TokenCheck {
  const [orderId, issued, sig] = String(token || '').split('.');
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId) || !/^\d{8}$/.test(issued || '') || !sig) return { ok: false, reason: 'invalid' };
  const expected = Buffer.from(signature(orderId, issued));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'invalid' };
  const issuedDate = `${issued.slice(0, 4)}-${issued.slice(4, 6)}-${issued.slice(6, 8)}`;
  if (addDaysToDate(issuedDate, REBOOK_LINK_DAYS) < texasDate(now)) return { ok: false, reason: 'expired' };
  return { ok: true, orderId };
}

/** The same rebook always gets the same key, so a second tap returns the first booking. */
export function rebookIdempotencyKey(orderId: string, date: string): string {
  const h = createHash('sha256').update(`rebook:${orderId}:${date}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * The pickup date: the same weekday a week after the last one, far enough ahead for the
 * card hold (3 days or more); Zone 5, its next open run.
 */
export function rebookDate(lastPickup: string, { zone5FirstRun, now = new Date() }: { zone5FirstRun?: string | null; now?: Date } = {}): string | null {
  if (zone5FirstRun !== undefined) return zone5FirstRun;
  const soonest = addDaysToDate(earliestPickupDate('standard', now), 1);
  let date = addDaysToDate(lastPickup, 7);
  while (date < soonest) date = addDaysToDate(date, 7);
  return date;
}

export type RebookFallback = 'not_found' | 'member' | 'no_card' | 'too_small' | 'no_date' | 'full' | 'expired' | 'invalid';

export interface RebookPlan {
  orderId: string;
  customerId: string;
  date: string;
  dateLabel: string;
  window: string;
  windowLabel: string;
  address: string;
  items: Array<{ garment_type: string; quantity: number }>;
  weightLbs: number;
  estimate: { subtotal: number; discount: number; total: number; hold: number };
  orderTwoDiscount: number;
  zoneName: string;
  alreadyBooked: { id: string; order_number: string } | null;
}

export type PlanResult = { ok: true; plan: RebookPlan } | { ok: false; reason: RebookFallback };

const FALLBACK_TEXT: Record<RebookFallback, string> = {
  not_found: "We couldn't find that order.",
  member: 'Your Routine already books your pickups automatically.',
  no_card: "There's no card on file to book with in one tap.",
  too_small: 'Your last order is below the order minimum on its own.',
  no_date: "We couldn't find a pickup day for you next week.",
  full: 'That pickup window is full.',
  expired: 'This link has expired (they last 14 days).',
  invalid: "This link isn't valid.",
};
export function fallbackText(reason: RebookFallback): string {
  return FALLBACK_TEXT[reason];
}

type One<T> = T | T[] | null | undefined;
const firstOf = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] : v) ?? null;

const ORDER_FIELDS =
  'id, customer_id, address_id, status, pickup_date, pickup_window, order_type, weight_lbs, zone_id, extended_reach_band, square_customer_id, square_card_id, items:order_items(garment_type, service_type, quantity), address:addresses(street, unit, city, zip)';

/** What one tap would book, or why it can't. */
export async function planRebook(supabase: AdminClient, orderId: string, coverage: Coverage, now: Date = new Date()): Promise<PlanResult> {
  const { data: order } = await supabase.from('orders').select(ORDER_FIELDS).eq('id', orderId).maybeSingle();
  if (!order || order.status === 'cancelled') return { ok: false, reason: 'not_found' };
  if (await getOpenMembership(supabase, order.customer_id)) return { ok: false, reason: 'member' };
  if (!order.square_customer_id || !order.square_card_id) return { ok: false, reason: 'no_card' };

  const zone = zoneForTemplate({ zone_id: order.zone_id ?? undefined, extended_reach_band: order.extended_reach_band ?? null }, coverage);
  const band = order.extended_reach_band ? coverage.extendedReach.bands.find((b) => b.id === order.extended_reach_band) ?? null : null;
  const today = texasDate(now);
  let date = band
    ? rebookDate(order.pickup_date, { zone5FirstRun: earliestExtendedReachRun(today, coverage.extendedReach) })
    : rebookDate(order.pickup_date, { now });
  if (date) date = nextZoneRouteDay(zone, date, coverage);
  if (!date || !validateSchedule({ pickupDate: date, pickupWindow: order.pickup_window, tier: 'standard', openBeyondWindow: band ? date : null }, now).ok) {
    return { ok: false, reason: 'no_date' };
  }

  // The last order's cleaning (alterations are one-offs), as it was itemized
  const rows = (order.items || []) as Array<{ garment_type: string; service_type: string; quantity: number }>;
  const items = rows.filter((i) => i.service_type === 'dry_clean').map((i) => ({ garment_type: i.garment_type, quantity: i.quantity }));
  const weightLbs = order.order_type === 'dry_clean' ? 0 : Number(order.weight_lbs) || 0;
  const reachFee = band ? extendedReachFee(band, false, coverage.extendedReach) : 0;
  const base = { dryCleanItems: items, weightLbs, frequency: 'one_time' as const, extendedReachFee: reachFee };
  if (orderMinimumGap(computeBookingFinancials(base).subtotal, zone, 'one_time', 0) > 0) return { ok: false, reason: 'too_small' };

  const earlier = await earlierPickups(supabase, order.customer_id);
  const orderTwoDiscount = isOrderTwo(earlier, date) ? ORDER_TWO_DISCOUNT : 0;
  const computed = computeBookingFinancials(orderTwoDiscount ? { ...base, promoDiscountAmount: orderTwoDiscount } : base);

  const { data: existing } = await supabase
    .from('orders')
    .select('id, order_number')
    .eq('customer_id', order.customer_id)
    .eq('pickup_date', date)
    .neq('status', 'cancelled')
    .limit(1);
  const address = firstOf(order.address as One<{ street: string; unit?: string | null; city: string; zip: string }>);
  return {
    ok: true,
    plan: {
      orderId: order.id,
      customerId: order.customer_id,
      date,
      dateLabel: formatLongDate(date),
      window: order.pickup_window,
      windowLabel: windowText(order.pickup_window),
      address: address ? `${address.street}${address.unit ? `, ${address.unit}` : ''}, ${address.city} ${address.zip}` : '',
      items,
      weightLbs,
      estimate: {
        subtotal: computed.subtotal,
        discount: computed.financials.discountAmount,
        total: computed.financials.finalTotal,
        hold: holdAmountFor(computed.financials.finalTotal, zone.minimumOrder),
      },
      orderTwoDiscount,
      zoneName: zone.name,
      alreadyBooked: existing?.[0] ?? null,
    },
  };
}

export type BookResult =
  | { ok: true; order: { id: string; order_number: string }; replay: boolean; plan: RebookPlan }
  | { ok: false; reason: RebookFallback };

/** Books the plan: create_booking (the same rules and window cap as any booking), on the card on file. */
export async function bookRebook(supabase: AdminClient, orderId: string, coverage: Coverage, now: Date = new Date()): Promise<BookResult> {
  const planned = await planRebook(supabase, orderId, coverage, now);
  if (!planned.ok) return planned;
  const plan = planned.plan;
  if (plan.alreadyBooked) return { ok: true, order: plan.alreadyBooked, replay: true, plan };

  const { data: last } = await supabase.from('orders').select(ORDER_FIELDS).eq('id', orderId).maybeSingle();
  if (!last) return { ok: false, reason: 'not_found' };
  const zone = zoneForTemplate({ zone_id: last.zone_id ?? undefined, extended_reach_band: last.extended_reach_band ?? null }, coverage);
  const band = last.extended_reach_band ? coverage.extendedReach.bands.find((b) => b.id === last.extended_reach_band) ?? null : null;
  const reachFee = band ? extendedReachFee(band, false, coverage.extendedReach) : 0;
  const computed = computeBookingFinancials({
    dryCleanItems: plan.items,
    weightLbs: plan.weightLbs,
    frequency: 'one_time',
    extendedReachFee: reachFee,
    ...(plan.orderTwoDiscount ? { promoDiscountAmount: plan.orderTwoDiscount } : {}),
  });
  const total = computed.financials.finalTotal;

  const { data, error } = await supabase.rpc('create_booking', {
    p: {
      idempotency_key: rebookIdempotencyKey(orderId, plan.date),
      window_capacity: BOOKING_WINDOW_CAPACITY,
      express_capacity: 0,
      reserve_promo: false,
      order: {
        order_number: `F11-${plan.date.slice(0, 4)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        customer_id: last.customer_id,
        address_id: last.address_id,
        order_type: last.order_type || 'mixed',
        pickup_date: plan.date,
        pickup_window: plan.window,
        delivery_date: zoneDeliveryDate(zone, plan.date, 'standard', {}, coverage),
        delivery_window: plan.window,
        weight_lbs: plan.weightLbs || null,
        subtotal: computed.subtotal,
        express_tier: 'standard',
        promo_code: null,
        discount_amount: computed.financials.discountAmount,
        express_surcharge: 0,
        environmental_fee: computed.financials.environmentalFee,
        sales_tax: computed.financials.salesTax,
        total,
        payment_id: null,
        payment_status: 'pending',
        square_customer_id: last.square_customer_id,
        square_card_id: last.square_card_id,
        // The hold is placed by the daily job 2 days before pickup (Zone 5: once its run is confirmed)
        hold_amount: holdAmountFor(total, zone.minimumOrder),
        hold_status: 'scheduled',
        payment_terms_accepted_at: now.toISOString(),
        zone_id: zone.id,
        distance_miles: null,
        extended_reach_band: band?.id ?? null,
        extended_reach_fee: reachFee,
        frequency: 'one_time',
        notes: `One-tap rebook of the order picked up ${last.pickup_date}`,
      },
      items: computed.itemizedList.map((item) => ({
        garment_type: item.garment_type,
        service_type: item.service_type,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        notes: item.notes || null,
        details: (item.details ?? null) as Json,
        quote_status: item.quote_status ?? 'none',
      })),
      event: { note: `Booked with one tap from the delivered text, for ${plan.date} (${plan.windowLabel})`, triggered_by: 'Customer (one-tap rebook)' },
    },
  });
  const result = data as { ok: boolean; replay?: boolean; error?: string; order?: { id: string; order_number: string } } | null;
  if (!error && result && !result.ok && /full/i.test(result.error || '')) return { ok: false, reason: 'full' };
  if (error || !result?.ok || !result.order) throw error || new Error(result?.error || 'create_booking refused the rebook');

  if (!result.replay) {
    // A booking within 7 days of a tested message counts for its version (client 2026-10-14)
    await recordBookingForMessages(supabase, last.customer_id, result.order.id, now);
    if (plan.orderTwoDiscount > 0) await supabase.from('orders').update({ order_two_discount: plan.orderTwoDiscount }).eq('id', result.order.id);
    const { data: customer } = await supabase.from('customers').select('full_name, phone, email').eq('id', last.customer_id).maybeSingle();
    await notifyOrderCustomer(
      { id: result.order.id, order_number: result.order.order_number, customer },
      "📋 You're booked",
      `First Eleven Cleaners: You're booked for ${plan.dateLabel}, ${plan.windowLabel}, at ${plan.address}.${plan.orderTwoDiscount ? ` Order two is $${plan.orderTwoDiscount} off.` : ''} We hold the estimate on your card 2 days before. Track or change it: ${getAppBaseUrl()}/track/${result.order.id}`,
      'booked'
    );
  }
  return { ok: true, order: result.order, replay: Boolean(result.replay), plan };
}

/**
 * The delivered text's "Book next week's pickup? [link]" line (A/B tested in Mission Control >
 * Messaging), or nothing for a Routine member (their pickups are automatic).
 */
export async function rebookLineForDelivered(supabase: AdminClient, orderId: string, now: Date = new Date()): Promise<string | undefined> {
  const { data: order } = await supabase.from('orders').select('id, customer_id, routine_membership_id').eq('id', orderId).maybeSingle();
  if (!order || order.routine_membership_id) return undefined;
  if (await getOpenMembership(supabase, order.customer_id)) return undefined;
  const picked = await pickMessage(supabase, { key: 'delivered_rebook', recipient: order.customer_id, customerId: order.customer_id, orderId: order.id, targetUrl: rebookUrl(order.id, now) });
  return fillMessage(picked.text, { link: picked.link });
}
