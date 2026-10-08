import type { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';
import { addDaysToDate, texasDate } from '@/lib/texas-time';
import { getAppBaseUrl } from '@/lib/constants';
import { releaseOrderHold } from '@/lib/payment-capture';
import { sendContactMessage } from '@/lib/messaging/contact';
import { reportError } from '@/lib/error-reporting';
import { greetingFirstName } from '@/lib/sanitize';
import type { Coverage } from '@/lib/coverage';
import type { ZoneConfig } from '@/lib/constants';
import {
  decideRoutineChange,
  followingPickup,
  weekdayName,
  ROUTINE_AUTO_PAUSE_SKIPS,
  ROUTINE_MAX_PAUSE_WEEKS,
  ROUTINE_PATH,
  ROUTINE_TERMS_VERSION,
  type RoutineCadence,
  type RoutineChange,
  type RoutineDecision,
  type RoutineMembership,
  type RoutinePatch,
  type RoutineTemplate,
} from '@/lib/routine';

/**
 * Routine memberships in the database (client 2026-10-08). Server only.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const MEMBERSHIP_FIELDS =
  'id, customer_id, status, cadence, pickup_day, pickup_window, address_id, next_pickup_date, paused_until, consecutive_skips, template, created_at, enrolled_order_id';

export function zoneForTemplate(template: Partial<RoutineTemplate> | null | undefined, coverage: Coverage): ZoneConfig {
  const id = template?.zone_id;
  if (id === 'zone_5') return coverage.extendedReachZone;
  return (id && coverage.zones[id as keyof Coverage['zones']]) || coverage.zones.zone_1;
}

/** The customer's open (active or paused) membership, if any. */
export async function getOpenMembership(supabase: AdminClient, customerId: string) {
  const { data } = await supabase.from('routine_memberships').select(MEMBERSHIP_FIELDS).eq('customer_id', customerId).neq('status', 'cancelled').maybeSingle();
  return data;
}

/** Joining at checkout: the membership starts with this booking as its first pickup. */
export async function createMembershipFromBooking(
  supabase: AdminClient,
  b: {
    customerId: string;
    orderId: string;
    cadence: RoutineCadence;
    pickupDate: string;
    pickupWindow: string;
    addressId: string | null;
    template: RoutineTemplate;
    squareCustomerId: string | null;
    squareCardId: string | null;
  }
): Promise<{ id: string; next_pickup_date: string } | null> {
  const row = {
    customer_id: b.customerId,
    status: 'active',
    cadence: b.cadence,
    pickup_day: weekdayName(b.pickupDate),
    pickup_window: b.pickupWindow,
    address_id: b.addressId,
    next_pickup_date: followingPickup(b.pickupDate, b.cadence),
    template: b.template as unknown as Json,
    square_customer_id: b.squareCustomerId,
    square_card_id: b.squareCardId,
    terms_version: ROUTINE_TERMS_VERSION,
    terms_accepted_at: new Date().toISOString(),
    enrolled_order_id: b.orderId,
  };
  const { data, error } = await supabase.from('routine_memberships').insert(row).select('id, next_pickup_date').single();
  if (error || !data) {
    reportError('routine/create', error, { alert: true, details: `Order ${b.orderId}: the Routine membership was not created` });
    return null;
  }
  await supabase.from('orders').update({ routine_membership_id: data.id }).eq('id', b.orderId);
  return { id: data.id, next_pickup_date: data.next_pickup_date as string };
}

/** Cancels this membership's automatic pickups still only booked (from a date on), releasing holds. */
async function cancelBookedPickups(supabase: AdminClient, m: { id: string; enrolled_order_id?: string | null }, { onDate, fromDate }: { onDate?: string; fromDate?: string }, why: string) {
  let query = supabase
    .from('orders')
    .select('id, order_number, hold_payment_id, hold_status')
    .eq('routine_membership_id', m.id)
    .eq('status', 'booked');
  if (onDate) query = query.eq('pickup_date', onDate);
  if (fromDate) query = query.gte('pickup_date', fromDate);
  if (m.enrolled_order_id) query = query.neq('id', m.enrolled_order_id);
  const { data: orders } = await query.limit(10);
  for (const order of orders || []) {
    const { data: cancelled } = await supabase
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('status', 'booked')
      .select('id');
    if (!cancelled || cancelled.length === 0) continue;
    await supabase.from('order_events').insert({ order_id: order.id, status: 'cancelled', note: `Routine pickup ${why}.`, triggered_by: 'Customer (Routine)' });
    await releaseOrderHold(supabase, order, `Routine pickup ${why}`);
  }
}

/** Eleven's check-in after 3 skips in a row (client: "auto-pause plus an Eleven check-in"). */
async function sendAutoPauseCheckIn(supabase: AdminClient, customerId: string) {
  const { data: c } = await supabase.from('customers').select('full_name, phone, email, sms_consent').eq('id', customerId).maybeSingle();
  if (!c) return;
  const sent = await sendContactMessage({
    phone: c.phone,
    email: c.email,
    smsConsent: Boolean(c.sms_consent),
    title: 'Your Routine is paused',
    body: `First Eleven Cleaners: Hi ${greetingFirstName(c.full_name, 'there')}, you've skipped 3 pickups in a row, so we've paused your Routine. Nothing is charged while it's paused. Reply and tell Eleven what would work better, or resume anytime: ${getAppBaseUrl()}${ROUTINE_PATH}`,
  });
  if (!sent.ok) reportError('routine/check-in', sent.error, { details: `Customer ${customerId}: auto-pause check-in not sent` });
}

/** The next automatic pickup already made (2 days ahead) and still only booked, if any. */
export async function upcomingAutoPickup(supabase: AdminClient, m: { id: string; enrolled_order_id?: string | null }, now: Date = new Date()) {
  let query = supabase
    .from('orders')
    .select('id, order_number, pickup_date, hold_payment_id, hold_status')
    .eq('routine_membership_id', m.id)
    .eq('status', 'booked')
    .gte('pickup_date', texasDate(now));
  if (m.enrolled_order_id) query = query.neq('id', m.enrolled_order_id);
  const { data } = await query.order('pickup_date').limit(1).maybeSingle();
  return data;
}

/**
 * Skips a pickup already made (the reminder's "skip this one?"): cancels that order and
 * releases its hold. The schedule goes on (skip never cancels); 3 in a row pause it.
 */
export async function skipAutoPickup(
  supabase: AdminClient,
  m: RoutineMembership & { enrolled_order_id?: string | null },
  pickup: { pickup_date: string },
  now: Date = new Date()
): Promise<RoutineDecision> {
  if (m.status !== 'active') return { ok: false, error: 'This Routine is not active.' };
  const skips = m.consecutive_skips + 1;
  const autoPaused = skips >= ROUTINE_AUTO_PAUSE_SKIPS;
  const patch: RoutinePatch = autoPaused
    ? { consecutive_skips: skips, status: 'paused', paused_until: addDaysToDate(texasDate(now), ROUTINE_MAX_PAUSE_WEEKS * 7), next_pickup_date: null }
    : { consecutive_skips: skips };
  const { error } = await supabase.from('routine_memberships').update({ ...patch, updated_at: now.toISOString() }).eq('id', m.id).eq('status', 'active');
  if (error) throw error;
  await cancelBookedPickups(supabase, m, autoPaused ? { fromDate: texasDate(now) } : { onDate: pickup.pickup_date }, autoPaused ? 'paused' : 'skipped');
  if (autoPaused) await sendAutoPauseCheckIn(supabase, m.customer_id);
  return { ok: true, patch, autoPaused, skippedDate: pickup.pickup_date };
}

/** Applies a customer's (or the system's) change and saves it. */
export async function applyRoutineChange(
  supabase: AdminClient,
  m: RoutineMembership & { enrolled_order_id?: string | null },
  change: RoutineChange,
  coverage: Coverage,
  now: Date = new Date()
): Promise<RoutineDecision> {
  // The next pickup may already be made (2 days ahead): skipping cancels that one
  if (change.action === 'skip' && m.status === 'active') {
    const made = await upcomingAutoPickup(supabase, m, now);
    if (made) return skipAutoPickup(supabase, m, made, now);
  }
  const decision = decideRoutineChange(m, change, zoneForTemplate(m.template as Partial<RoutineTemplate>, coverage), coverage, now);
  if (!decision.ok) return decision;
  const { error } = await supabase
    .from('routine_memberships')
    .update({ ...decision.patch, updated_at: now.toISOString() })
    .eq('id', m.id)
    .neq('status', 'cancelled');
  if (error) throw error;

  // An automatic pickup already made for a date that's no longer happening is cancelled
  if (change.action === 'skip' && decision.skippedDate) {
    await cancelBookedPickups(supabase, m, { onDate: decision.skippedDate }, 'skipped');
  } else if (change.action === 'pause' || change.action === 'cancel' || decision.autoPaused) {
    await cancelBookedPickups(supabase, m, { fromDate: texasDate(now) }, change.action === 'cancel' ? 'cancelled with the membership' : 'paused');
  } else if (change.action === 'update' && decision.patch.next_pickup_date && decision.patch.next_pickup_date !== m.next_pickup_date) {
    await cancelBookedPickups(supabase, m, { fromDate: texasDate(now) }, 'moved to the new day');
  }
  if (decision.autoPaused) await sendAutoPauseCheckIn(supabase, m.customer_id);
  return decision;
}
