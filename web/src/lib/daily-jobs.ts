import type { createAdminClient } from '@/lib/supabase/admin';
import { getSquareConfig, createHold } from '@/lib/square';
import { addDaysToDate, texasDate } from '@/lib/texas-time';
import { HOLD_LEAD_DAYS } from '@/lib/payment-hold';
import { amountOwed } from '@/lib/payment-recovery';
import { messagingService } from '@/lib/messaging';
import { getAppBaseUrl } from '@/lib/constants';
import { reportError } from '@/lib/error-reporting';

/**
 * The daily job (client 2026-10-06, Part A), run once a day at 9 AM Dallas by Vercel Cron
 * (/api/cron/daily). On Vercel's Hobby plan jobs run daily, so "after 24 hours" means
 * "at the first daily run after 24 hours".
 *
 * 1. Places the card holds for pickups 2 days away (bookings made further ahead). A decline
 *    asks the customer for a new card before pickup and shows the order in Mission Control.
 * 2. Marks holds Square has let expire (7 days uncaptured); intake then charges the card.
 * 3. Payment Needed ladder: reminder after 24 h, staff call after 48 h, owner decision after
 *    7 days. Delivery stays held until the order is paid.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

const HOUR = 60 * 60 * 1000;
export const LADDER = { reminderAfterHours: 24, staffCallAfterHours: 48, ownerAfterHours: 7 * 24 } as const;

type Customer = { full_name?: string | null; phone?: string | null; email?: string | null; sms_consent?: boolean | null };
const firstOf = (c: Customer | Customer[] | null | undefined): Customer | null => (Array.isArray(c) ? c[0] : c) || null;

async function notify(
  order: { id: string; order_number?: string | null; customer?: Customer | Customer[] | null },
  title: string,
  message: string,
  stage: 'booked' | 'weighed_itemized'
) {
  const customer = firstOf(order.customer);
  await messagingService.dispatchStageNotification({
    orderId: order.id,
    orderNumber: order.order_number || order.id.slice(0, 8),
    customerName: customer?.full_name || 'Valued Customer',
    customerPhone: customer?.phone || '',
    ...(customer?.phone ? {} : { smsConsent: false }),
    customerEmail: customer?.email ?? undefined,
    stage,
    trackingUrl: `${getAppBaseUrl()}/track/${order.id}`,
    customMessage: message,
    customTitle: title,
  });
}

export interface HoldRunResult {
  placed: number;
  declined: number;
}

/** 1. Holds for pickups within 2 days that were booked further ahead. */
export async function placeScheduledHolds(supabase: AdminClient, now: Date = new Date()): Promise<HoldRunResult> {
  const result: HoldRunResult = { placed: 0, declined: 0 };
  const squareConfig = getSquareConfig();
  if (!squareConfig.isLive) return result;

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, pickup_date, hold_amount, square_customer_id, square_card_id, customer:customers!customer_id(full_name, phone, email)')
    .eq('hold_status', 'scheduled')
    .eq('status', 'booked')
    .lte('pickup_date', addDaysToDate(texasDate(now), HOLD_LEAD_DAYS))
    .limit(200);

  for (const order of orders || []) {
    const orderRef = order.order_number || order.id.slice(0, 8);
    const amount = Number(order.hold_amount) || 0;
    const placed =
      order.square_customer_id && order.square_card_id && amount > 0
        ? await createHold(squareConfig, {
            squareCustomerId: order.square_customer_id,
            cardId: order.square_card_id,
            amount,
            orderNumber: orderRef,
            idempotencyKey: `hold_${order.id.replace(/-/g, '')}`.slice(0, 45),
          })
        : ({ ok: false, error: 'No card on file for this order' } as const);

    if (placed.ok) {
      result.placed += 1;
      await supabase
        .from('orders')
        .update({
          hold_payment_id: placed.paymentId,
          hold_expires_at: placed.expiresAt,
          hold_status: 'held',
          payment_status: 'authorized',
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)
        .eq('hold_status', 'scheduled');
      await supabase.from('order_payments').insert({
        order_id: order.id,
        square_payment_id: placed.paymentId,
        kind: 'hold',
        amount,
        status: 'approved',
        note: 'Hold for the estimated total, placed 2 days before pickup',
      });
      continue;
    }

    result.declined += 1;
    await supabase
      .from('orders')
      .update({ hold_status: 'declined', updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('hold_status', 'scheduled');
    await supabase.from('order_events').insert({
      order_id: order.id,
      status: 'booked',
      note: `Card hold of $${amount.toFixed(2)} declined 2 days before pickup (${placed.error}). Customer asked for a new card.`,
      triggered_by: 'Daily Payment Job',
    });
    await notify(
      order,
      '💳 New card needed before pickup',
      `Eleven at First Eleven Cleaners: we couldn't place the hold for your pickup on ${order.pickup_date} (Order #${orderRef}). Please add a new card before pickup: ${getAppBaseUrl()}/track/${order.id}`,
      'booked'
    );
    reportError('daily-job/hold-declined', placed.error, { alert: true, details: `Order ${orderRef}: card hold declined 2 days before pickup on ${order.pickup_date}` });
  }
  return result;
}

/** 2. Holds Square cancelled after 7 days uncaptured. */
export async function markExpiredHolds(supabase: AdminClient, now: Date = new Date()): Promise<number> {
  const { data } = await supabase
    .from('orders')
    .update({ hold_status: 'expired', updated_at: new Date().toISOString() })
    .eq('hold_status', 'held')
    .lt('hold_expires_at', now.toISOString())
    .select('id');
  return data?.length ?? 0;
}

export interface LadderResult {
  reminded: number;
  callsDue: number;
  ownerFlagged: number;
}

/** 3. The Payment Needed ladder. Each order moves at most one step per run. */
export async function runPaymentNeededLadder(supabase: AdminClient, now: Date = new Date()): Promise<LadderResult> {
  const result: LadderResult = { reminded: 0, callsDue: 0, ownerFlagged: 0 };
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, total, amount_due, payment_needed_since, payment_reminder_stage, customer:customers!customer_id(full_name, phone, email)')
    .eq('payment_status', 'failed')
    .lt('payment_reminder_stage', 3)
    .not('payment_needed_since', 'is', null)
    .neq('status', 'cancelled')
    .limit(200);

  for (const order of orders || []) {
    const since = new Date(order.payment_needed_since as string).getTime();
    const hours = (now.getTime() - since) / HOUR;
    const stage = Number(order.payment_reminder_stage) || 0;
    const orderRef = order.order_number || order.id.slice(0, 8);
    const owed = amountOwed(order);

    let next = stage;
    if (stage === 0 && hours >= LADDER.reminderAfterHours) {
      await notify(
        order,
        '💳 Reminder: payment needed',
        `Eleven at First Eleven Cleaners: a reminder that Order #${orderRef} still needs $${owed.toFixed(2)}. Your order is cleaned and waiting; we'll deliver it as soon as it's paid. Add a new card here: ${getAppBaseUrl()}/track/${order.id}`,
        'weighed_itemized'
      );
      next = 1;
      result.reminded += 1;
    } else if (stage === 1 && hours >= LADDER.staffCallAfterHours) {
      reportError('daily-job/payment-call', `Call the customer: order ${orderRef} still needs payment`, {
        alert: true,
        details: `Order ${orderRef} has needed $${owed.toFixed(2)} for 48 hours. Please call the customer today (Mission Control > Payment Needed).`,
      });
      next = 2;
      result.callsDue += 1;
    } else if (stage === 2 && hours >= LADDER.ownerAfterHours) {
      reportError('daily-job/payment-owner', `Owner decision needed: order ${orderRef} unpaid for 7 days`, {
        alert: true,
        details: `Order ${orderRef} has needed $${owed.toFixed(2)} for 7 days and delivery is held. Please decide what to do.`,
      });
      next = 3;
      result.ownerFlagged += 1;
    }

    if (next !== stage) {
      await supabase
        .from('orders')
        .update({ payment_reminder_stage: next, updated_at: new Date().toISOString() })
        .eq('id', order.id)
        .eq('payment_reminder_stage', stage);
      await supabase.from('order_events').insert({
        order_id: order.id,
        status: 'payment_failed',
        note:
          next === 1
            ? `Payment reminder sent ($${owed.toFixed(2)} needed).`
            : next === 2
              ? 'Payment still needed after 48 hours: staff call due.'
              : 'Payment still needed after 7 days: flagged for an owner decision.',
        triggered_by: 'Daily Payment Job',
      });
    }
  }
  return result;
}
