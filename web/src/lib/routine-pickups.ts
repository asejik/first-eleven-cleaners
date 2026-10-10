import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';
import { addDaysToDate, texasDate } from '@/lib/texas-time';
import { HOLD_LEAD_DAYS, holdAmountFor } from '@/lib/payment-hold';
import { computeBookingFinancials, extendedReachFee, getAppBaseUrl } from '@/lib/constants';
import { isZoneRouteDay, zoneDeliveryDate, formatLongDate, type Coverage } from '@/lib/coverage';
import { notifyOrderCustomer } from '@/lib/daily-jobs';
import { sendContactMessage } from '@/lib/messaging/contact';
import { reportError } from '@/lib/error-reporting';
import { greetingFirstName } from '@/lib/sanitize';
import {
  decideRoutineChange,
  firstPickupOnOrAfter,
  followingPickup,
  weekdayName,
  windowText,
  CADENCE_LABEL,
  ROUTINE_PATH,
  ROUTINE_TERMS_VERSION,
  type RoutineCadence,
  type RoutineMembership,
  type RoutineTemplate,
} from '@/lib/routine';
import { MEMBERSHIP_FIELDS, zoneForTemplate } from '@/lib/routine-store';
import { founderStatus, planDiscountFor } from '@/lib/founding';

/**
 * Automatic Routine pickups (client 2026-10-07, revised: "The system auto-creates each order
 * 48 hours ahead, sends 'Your pickup is Tuesday morning, skip this one?', and places the
 * authorization at creation. One tap to skip; skip never cancels.") Run by the 9 AM daily job,
 * before the card holds, so each new pickup gets its hold in the same run (Zone 5: once its
 * run is confirmed). Paused memberships whose pause has ended resume first.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

/** A member's standing stop always fits its window (the window cap is for new bookings). */
const ROUTINE_WINDOW_CAPACITY = 1000;

/** The same pickup always gets the same key, so a second run never makes it twice. */
export function routineIdempotencyKey(membershipId: string, date: string): string {
  const h = createHash('sha256').update(`routine:${membershipId}:${date}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function skipSignature(orderId: string): string {
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-dev-pepper';
  return createHmac('sha256', pepper).update(`routine-skip:${orderId}`).digest('hex').slice(0, 24);
}

/** The one-tap skip link's token: the order and a signature, so nobody can skip someone else's. */
export function routineSkipToken(orderId: string): string {
  return `${orderId}.${skipSignature(orderId)}`;
}

export function orderIdFromSkipToken(token: string): string | null {
  const [orderId, signature] = token.split('.');
  if (!orderId || !signature || !/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const expected = Buffer.from(skipSignature(orderId));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? orderId : null;
}

export function routineSkipUrl(orderId: string): string {
  return `${getAppBaseUrl()}/routine/skip/${routineSkipToken(orderId)}`;
}

/** "Your pickup is Tuesday morning, Oct 13 (7:30 to 10:00 AM). Skip this one? ..." */
export function routineReminderText(firstName: string, date: string, window: string, skipUrl: string): string {
  const part = window === 'evening' ? 'evening' : 'morning';
  return `First Eleven Cleaners: Hi ${firstName}, your Routine pickup is ${weekdayName(date)} ${part}, ${formatLongDate(date).replace(/^\w+, /, '')} (${windowText(window)}). Skip this one? Reply SKIP or tap ${skipUrl}. Nothing to do if you're all set.`;
}

export interface RoutinePickupResult {
  created: number;
  resumed: number;
  problems: number;
}

type MembershipRow = RoutineMembership & {
  enrolled_order_id: string | null;
  square_customer_id?: string | null;
  square_card_id?: string | null;
  customer?: { full_name: string; phone: string | null; email: string; sms_consent: boolean } | Array<{ full_name: string; phone: string | null; email: string; sms_consent: boolean }> | null;
};
const firstOf = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Paused memberships whose pause has ended start again, and are told the next pickup. */
async function resumeEndedPauses(supabase: AdminClient, coverage: Coverage, now: Date): Promise<number> {
  const today = texasDate(now);
  const { data } = await supabase
    .from('routine_memberships')
    .select(`${MEMBERSHIP_FIELDS}, customer:customers!customer_id(full_name, phone, email, sms_consent)`)
    .eq('status', 'paused')
    .lte('paused_until', today)
    .limit(200);
  let resumed = 0;
  for (const m of (data || []) as unknown as MembershipRow[]) {
    const decision = decideRoutineChange(m, { action: 'resume' }, zoneForTemplate(m.template as Partial<RoutineTemplate>, coverage), coverage, now);
    if (!decision.ok) continue;
    const { data: saved } = await supabase
      .from('routine_memberships')
      .update({ ...decision.patch, updated_at: now.toISOString() })
      .eq('id', m.id)
      .eq('status', 'paused')
      .select('id');
    if (!saved || saved.length === 0) continue;
    resumed += 1;
    const c = firstOf(m.customer);
    if (c && decision.patch.next_pickup_date) {
      await sendContactMessage({
        phone: c.phone,
        email: c.email,
        smsConsent: Boolean(c.sms_consent),
        title: 'Your Routine is back on',
        body: `First Eleven Cleaners: Hi ${greetingFirstName(c.full_name, 'there')}, your Routine is back on. Next pickup: ${formatLongDate(decision.patch.next_pickup_date)}, ${windowText(m.pickup_window)}. Skip or pause anytime: ${getAppBaseUrl()}${ROUTINE_PATH}`,
      });
    }
  }
  return resumed;
}

/** Makes one pickup's order through create_booking (the estimate from the joining booking). */
async function createPickupOrder(supabase: AdminClient, m: MembershipRow, date: string, coverage: Coverage, now: Date) {
  const template = m.template as Partial<RoutineTemplate>;
  const zone = zoneForTemplate(template, coverage);
  const services = (template.services || {}) as { dry_clean_items?: Array<{ garment_type: string; quantity: number }>; estimated_weight_lbs?: number };
  const band = template.extended_reach_band ? coverage.extendedReach.bands.find((b) => b.id === template.extended_reach_band) ?? null : null;
  const reachFee = band ? extendedReachFee(band, true, coverage.extendedReach) : 0;
  // A Founding member's plan rate is locked for life (client 2026-10-10)
  const founder = await founderStatus(supabase, m.customer_id);
  const computed = computeBookingFinancials({
    dryCleanItems: services.dry_clean_items || [],
    weightLbs: services.estimated_weight_lbs || 0,
    frequency: m.cadence,
    extendedReachFee: reachFee,
    planDiscountPercent: founder?.active ? planDiscountFor(m.cadence, founder) : undefined,
  });
  const hasCard = Boolean(m.square_customer_id && m.square_card_id);
  const total = computed.financials.finalTotal;

  const { data, error } = await supabase.rpc('create_booking', {
    p: {
      idempotency_key: routineIdempotencyKey(m.id, date),
      window_capacity: ROUTINE_WINDOW_CAPACITY,
      express_capacity: 0,
      reserve_promo: false,
      order: {
        order_number: `F11-${date.slice(0, 4)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        customer_id: m.customer_id,
        address_id: m.address_id,
        order_type: template.order_type || 'mixed',
        pickup_date: date,
        pickup_window: m.pickup_window,
        delivery_date: zoneDeliveryDate(zone, date, 'standard', {}, coverage),
        delivery_window: m.pickup_window,
        weight_lbs: services.estimated_weight_lbs || null,
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
        square_customer_id: m.square_customer_id ?? null,
        square_card_id: m.square_card_id ?? null,
        // The hold is placed by the daily job right after (2 days before pickup)
        hold_amount: hasCard ? holdAmountFor(total, zone.minimumOrder) : null,
        hold_status: hasCard ? 'scheduled' : 'none',
        payment_terms_accepted_at: now.toISOString(),
        payment_terms_version: ROUTINE_TERMS_VERSION,
        zone_id: zone.id,
        distance_miles: null,
        extended_reach_band: band?.id ?? null,
        extended_reach_fee: reachFee,
        frequency: m.cadence,
        routine_membership_id: m.id,
        notes: `Routine pickup (${CADENCE_LABEL[m.cadence as RoutineCadence]})`,
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
      event: { note: `Routine pickup made automatically for ${date} (${windowText(m.pickup_window)})`, triggered_by: 'Routine' },
    },
  });
  const result = data as { ok: boolean; replay?: boolean; error?: string; order?: { id: string; order_number: string } } | null;
  if (error || !result?.ok || !result.order) throw error || new Error(result?.error || 'create_booking refused the Routine pickup');
  return { order: result.order, replay: Boolean(result.replay), hasCard };
}

/** The daily job's Routine step: resume ended pauses, then make the pickups 2 days out. */
export async function createRoutinePickups(supabase: AdminClient, coverage: Coverage, now: Date = new Date()): Promise<RoutinePickupResult> {
  const result: RoutinePickupResult = { created: 0, resumed: await resumeEndedPauses(supabase, coverage, now), problems: 0 };
  const today = texasDate(now);
  const { data } = await supabase
    .from('routine_memberships')
    .select(`${MEMBERSHIP_FIELDS}, square_customer_id, square_card_id, customer:customers!customer_id(full_name, phone, email, sms_consent)`)
    .eq('status', 'active')
    .not('next_pickup_date', 'is', null)
    .lte('next_pickup_date', addDaysToDate(today, HOLD_LEAD_DAYS))
    .limit(200);

  for (const m of (data || []) as unknown as MembershipRow[]) {
    const zone = zoneForTemplate(m.template as Partial<RoutineTemplate>, coverage);
    let date = m.next_pickup_date as string;
    try {
      // Missed (the job didn't run): move on to the next pickup that can still happen
      while (date <= today) date = followingPickup(date, m.cadence);
      if (date > addDaysToDate(today, HOLD_LEAD_DAYS)) {
        await supabase.from('routine_memberships').update({ next_pickup_date: date, updated_at: now.toISOString() }).eq('id', m.id);
        continue;
      }
      // The zone's route days changed under this member: next valid day, and an admin is told
      if (!isZoneRouteDay(zone, date, coverage) || !m.address_id) {
        const next = firstPickupOnOrAfter(addDaysToDate(date, 1), m.pickup_day, zone, coverage);
        await supabase.from('routine_memberships').update({ next_pickup_date: next, updated_at: now.toISOString() }).eq('id', m.id);
        reportError('routine/pickup', `Routine ${m.id}: no pickup made for ${date}`, {
          alert: true,
          details: !m.address_id ? 'The membership has no address: ask the customer for one.' : `${date} is not a route day for ${zone.name}: moved to ${next}.`,
        });
        result.problems += 1;
        continue;
      }

      // The last pickup went ahead: the skip streak starts over
      const { data: last } = await supabase
        .from('orders')
        .select('status')
        .eq('routine_membership_id', m.id)
        .lt('pickup_date', date)
        .order('pickup_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      const streak = last && last.status !== 'cancelled' ? 0 : m.consecutive_skips;

      const made = await createPickupOrder(supabase, m, date, coverage, now);
      await supabase
        .from('routine_memberships')
        .update({ next_pickup_date: followingPickup(date, m.cadence), consecutive_skips: streak, updated_at: now.toISOString() })
        .eq('id', m.id)
        .eq('next_pickup_date', m.next_pickup_date as string);
      if (made.replay) continue;
      result.created += 1;
      if (!made.hasCard) {
        reportError('routine/pickup', `Routine ${m.id}: pickup ${made.order.order_number} has no card on file`, { alert: true, details: 'Intake will need to take payment.' });
      }

      const c = firstOf(m.customer);
      await notifyOrderCustomer(
        { id: made.order.id, order_number: made.order.order_number, customer: c ? { ...c, sms_consent: c.sms_consent } : null },
        `🔄 Your Routine pickup is ${weekdayName(date)}`,
        routineReminderText(greetingFirstName(c?.full_name, 'there'), date, m.pickup_window, routineSkipUrl(made.order.id)),
        'booked'
      );
    } catch (err) {
      result.problems += 1;
      reportError('routine/pickup', err, { alert: true, details: `Routine ${m.id}: the pickup for ${date} was not made` });
    }
  }
  return result;
}
