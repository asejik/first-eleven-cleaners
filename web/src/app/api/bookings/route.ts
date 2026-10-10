import { NextResponse } from 'next/server';
import { z } from 'zod';
import { personNameSchema } from '@/lib/sanitize';
import type { Order } from '@/types';
import type { Json } from '@/types/database';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { messagingService } from '@/lib/messaging';
import {
  getAppBaseUrl,
  ROUTES,
  orderMinimumGap,
  memberZoneMinimum,
  MEMBER_PROMO_NOT_COMBINED,
  type PlanFrequency,
  extendedReachFee,
  EXTENDED_REACH_LABEL,
  isExpressExcluded,
  DRY_CLEAN_PRICES,
  EXPRESS_DAILY_SLOT_CAP,
  PROMO_CODE_LAUNCH,
  PROMO_DISCOUNT_PERCENT,
  computeBookingFinancials,
} from '@/lib/constants';
import { getSquareConfig, saveCardOnFile, createHold, cancelHold, type SavedCard } from '@/lib/square';
import { holdAmountFor, shouldPlaceHoldNow, PAYMENT_TERMS_VERSION } from '@/lib/payment-hold';
import { checkAlterationLine, buttonsOnlyError, instructionText } from '@/lib/alterations';
import { resolveAndUploadPhotoUrl } from '@/lib/storage';
import { apiError } from '@/lib/api-errors';
import { texasDate } from '@/lib/texas-time';
import { validateSchedule } from '@/lib/schedule';
import { getCoverage } from '@/lib/coverage-settings';
import { resolveAddressCoverage } from '@/lib/distance';
import {
  isZoneRouteDay,
  nextZoneRouteDay,
  zoneDeliveryDate,
  earliestExtendedReachRun,
  isRoutineFrequency,
  formatLongDate,
  dispatchThresholdMessage,
  extendedReachStartLine,
} from '@/lib/coverage';
import { runBookingCount, runDeliveriesDue, isRunDispatched, dispatchRunIfReady, sendOnTheList, bandThreshold, runStatusLine } from '@/lib/extended-reach';
import { extendedReachTurnaroundLine } from '@/lib/constants';
import { runAfterResponse } from '@/lib/after-response';
import { reportError } from '@/lib/error-reporting';
import { phoneSchema } from '@/lib/phone';
import { hasUsedPromo, promoUsedMessage } from '@/lib/promo';
import { CADENCE_LABEL, ROUTINE_PATH, type RoutineCadence } from '@/lib/routine';
import { createMembershipFromBooking, getOpenMembership } from '@/lib/routine-store';
import { ensureAuthUser } from '@/lib/passwordless';
import { claimFounding, founderStatus, planDiscountFor, FOUNDER_HEAD_START_DAYS } from '@/lib/founding';
import { checkReferralForBooking, recordReferral, referrerForCode, REFERRAL_AMOUNT } from '@/lib/referrals';

const BookingSchema = z.object({
  customer: z.object({
    full_name: personNameSchema,
    email: z.string().email(),
    phone: phoneSchema, // stored as E.164 (PR-18)
  }),
  address: z.object({
    street: z.string().min(3),
    unit: z.string().optional(),
    city: z.string().default('Dallas'),
    state: z.string().default('TX'),
    zip: z.string().min(5),
    delivery_notes: z.string().optional(),
  }),
  services: z.object({
    type: z.enum(['dry_clean', 'wash_fold', 'mixed']),
    dry_clean_items: z.array(z.object({
      garment_type: z.string(),
      quantity: z.number().int().positive(),
    })).optional().default([]),
    estimated_weight_lbs: z.number().nonnegative().optional().default(0),
    // One line per alteration piece (buttons: one line with a quantity), each with its fit
    // instruction; lib/alterations.ts checks them (client 2026-10-06, Parts B-D)
    alteration_items: z.array(z.object({
      garment_type: z.string(),
      quantity: z.number().int().positive().max(50).default(1),
      instruction: z.discriminatedUnion('type', [
        z.object({ type: z.literal('measurement'), value: z.number(), unit: z.enum(['in', 'cm']) }),
        z.object({ type: z.literal('match') }),
        z.object({ type: z.literal('pinned') }),
        z.object({ type: z.literal('amount'), text: z.string().max(300) }),
        z.object({ type: z.literal('description'), text: z.string().max(300) }),
      ]),
      notes: z.string().max(300).optional(),
      // General repair: a photo resized on the phone (JPEG/PNG/WebP data URL, about 1 MB at most)
      photo: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/, 'Photos must be JPEG, PNG or WebP.').max(2_000_000).optional(),
    })).max(30).optional().default([]),
  }),
  schedule: z.object({
    pickup_date: z.string(),
    pickup_window: z.enum(['morning', 'evening']),
    express_tier: z.enum(['standard', 'express_24hr']).default('standard'),
    frequency: z.enum(['one_time', 'weekly', 'biweekly']).optional().default('one_time'),
  }),
  pricing: z.object({
    subtotal: z.number().default(0),
    discount_amount: z.number().default(0),
    total: z.number().default(0),
    promo_code: z.string().optional().nullable(),
  }).default({ subtotal: 0, discount_amount: 0, total: 0 }),
  payment_method: z.object({
    card_brand: z.string().default('visa'),
    last_4: z.string().default('4242'),
    payment_token: z.string().optional().nullable(),
  }).optional(),
  consents: z.object({
    sms_order_updates: z.boolean().default(false),
    sms_promotions: z.boolean().default(false),
    // Required checkout acceptance of the hold-and-charge terms (client 2026-10-06, Part A)
    payment_terms: z.boolean().default(false),
    // Joining the Routine: the auto-renewal agreement (client 2026-10-08)
    routine_terms: z.boolean().default(false),
  }).default({ sms_order_updates: false, sms_promotions: false, payment_terms: false, routine_terms: false })
    .refine((c) => c.payment_terms, { message: 'Please accept the payment terms to book your pickup.', path: ['payment_terms'] }),
  // One per checkout, generated by the browser: a repeated submit returns the first order (PR-11)
  idempotency_key: z.guid().optional(),
});

/** Bookings per pickup window per day. */
const WINDOW_CAPACITY = 25;

type CreateBookingResult =
  | { ok: true; replay: boolean; order: { id: string; order_number: string; total: number; status: string; customer_id: string } }
  | { ok: false; error: 'window_full' | 'express_full' | 'promo_used' | 'promo_exhausted' | string };

/** Customer-facing message for a booking create_booking (or the quick pre-check) refused. */
function bookingRefusal(
  reason: string,
  schedule: { pickup_date: string; pickup_window: string },
  promoCode: string | null
): { status: number; error: string } {
  switch (reason) {
    case 'window_full':
      return { status: 400, error: `The ${schedule.pickup_window} pickup window for ${schedule.pickup_date} has reached full capacity. Please select another window or date.` };
    case 'express_full':
      return { status: 400, error: `24-Hour Express capacity for ${schedule.pickup_date} has reached its daily limit of ${EXPRESS_DAILY_SLOT_CAP} orders. Please select 48-Hour Standard pickup.` };
    case 'promo_used':
      return { status: 400, error: `${promoUsedMessage(promoCode ?? '')} Please remove it and try again.` };
    case 'promo_exhausted':
      return { status: 409, error: `Promo code ${promoCode} has reached its usage limit. Please remove it and try again.` };
    default:
      return { status: 400, error: 'This booking could not be scheduled. Please try another date or call us.' };
  }
}

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = await checkRateLimitAsync(`booking:${clientIp}`, 10, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many booking requests from this network. Please wait a minute and try again.' },
        { status: 429 }
      );
    }

    const rawBody = await request.json();
    const validated = BookingSchema.parse(rawBody);

    // Weekly or Bi-Weekly means joining the Routine, a standing pickup (client 2026-10-08)
    const routineCadence: RoutineCadence | null = validated.schedule.frequency === 'one_time' ? null : validated.schedule.frequency;
    if (routineCadence && !validated.consents.routine_terms) {
      return NextResponse.json({ error: 'Please accept the Routine membership terms to join.' }, { status: 400 });
    }

    // Per-contact limits (SEC-09): bookings send an email/SMS to the supplied contact, so cap
    // them per recipient as well as per network to stop spam and SMS bombing.
    const contactEmail = validated.customer.email.trim().toLowerCase();
    const contactPhone = validated.customer.phone.replace(/\D/g, '').slice(-10);
    const ONE_HOUR = 60 * 60 * 1000;
    const [emailCheck, phoneCheck] = await Promise.all([
      checkRateLimitAsync(`booking_email:${contactEmail}`, 5, ONE_HOUR),
      contactPhone ? checkRateLimitAsync(`booking_phone:${contactPhone}`, 5, ONE_HOUR) : Promise.resolve({ allowed: true }),
    ]);
    if (!emailCheck.allowed || !phoneCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many bookings for this email or phone number in the last hour. Please try again later or call us.' },
        { status: 429 }
      );
    }

    const isSupabaseConfigured =
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

    // Card on file is required whenever Square is configured (SEC-06). The card token is
    // exchanged for a saved Square card below, before the order is created.
    const squareConfig = getSquareConfig();
    const cardToken = validated.payment_method?.payment_token || null;

    if (squareConfig.isLive) {
      if (!cardToken || cardToken.startsWith('sim_') || cardToken.startsWith('sq_sim_')) {
        return NextResponse.json(
          { error: 'A verified payment card token is required to schedule a pickup.' },
          { status: 400 }
        );
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.error('[Bookings] Square is not configured in production; refusing unpaid booking.');
      reportError('api/bookings', 'Square is not configured in production: online booking is refusing all bookings', { alert: true });
      return NextResponse.json(
        { error: 'Online booking is temporarily unavailable. Please call us to schedule your pickup.' },
        { status: 503 }
      );
    }

    // 1. Resolve the zone: the Zone 1-4 ZIP lists, else driving distance from the hub (Zone 5
    // Extended Reach bands; beyond them, the waitlist). Client 2026-10-07, request 8.
    const coverage = await getCoverage();
    const resolution = await resolveAddressCoverage(validated.address, coverage);
    if (resolution.status !== 'served') {
      return NextResponse.json(
        {
          error:
            resolution.status === 'waitlist' && resolution.reason === 'zone5_not_started'
              ? `${extendedReachStartLine(coverage.extendedReach)} Join the waitlist and we'll tell you when your route opens.`
              : `Not in your area yet: ${validated.address.zip} is beyond our delivery routes. Join the waitlist and we'll tell you when we reach you.`,
          code: 'WAITLIST',
        },
        { status: 400 }
      );
    }
    const zone = resolution.zone;
    const band = resolution.band;
    // Routine member pricing (client 2026-10-08): joining with this booking, or a signed-in
    // member (active or paused) booking an extra pickup, which is priced at their plan
    let memberCadence: RoutineCadence | null = null;
    let signedInCustomerId: string | null = null;
    if (isSupabaseConfigured) {
      const {
        data: { user: signedIn },
      } = await (await createClient()).auth.getUser();
      if (signedIn) {
        const admin = createAdminClient();
        const { data: me } = await admin.from('customers').select('id').eq('auth_id', signedIn.id).maybeSingle();
        signedInCustomerId = me?.id ?? null;
        const open = me ? await getOpenMembership(admin, me.id) : null;
        memberCadence = open ? (open.cadence as RoutineCadence) : null;
      }
    }
    const planFrequency: PlanFrequency = memberCadence ?? validated.schedule.frequency;
    // A Founding member (client 2026-10-10): their locked plan rate, and a day's head start
    const founder = signedInCustomerId ? await founderStatus(createAdminClient(), signedInCustomerId) : null;
    const founderActive = Boolean(founder?.active);

    // A friend's referral code (client 2026-10-10): $15 off a new customer's first order. It's
    // money, not a promo, so it also applies with member pricing.
    let referral: { referrerId: string; code: string } | null = null;
    const enteredCode = validated.pricing.promo_code?.trim() || '';
    if (enteredCode && isSupabaseConfigured && (await referrerForCode(createAdminClient(), enteredCode))) {
      const admin = createAdminClient();
      const { data: byEmail } = await admin.from('customers').select('id, auth_id').eq('email', validated.customer.email).maybeSingle();
      const check = await checkReferralForBooking(admin, enteredCode, {
        customerId: signedInCustomerId ?? (byEmail && !byEmail.auth_id ? byEmail.id : null),
        email: validated.customer.email,
      });
      if (!check.ok) return NextResponse.json({ error: check.error, code: 'REFERRAL_INVALID' }, { status: 400 });
      referral = { referrerId: check.referrerId, code: check.code };
    }
    if (planFrequency !== 'one_time' && enteredCode && !referral) {
      return NextResponse.json({ error: MEMBER_PROMO_NOT_COMBINED, code: 'PROMO_NOT_COMBINED' }, { status: 400 });
    }
    // Zone 5: the Extended Reach fee, half off for Routine members
    const isRoutine = isRoutineFrequency(planFrequency);
    const reachFee = band ? extendedReachFee(band, isRoutine, coverage.extendedReach) : 0;

    // 1b. Alterations: every piece needs a valid fit instruction; buttons alone can't be booked
    const alterationItems = validated.services.alteration_items;
    for (const line of alterationItems) {
      const check = checkAlterationLine(line);
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
      if (line.photo && !DRY_CLEAN_PRICES[line.garment_type]?.photoAllowed) {
        return NextResponse.json({ error: 'A photo can only be added to a general repair.' }, { status: 400 });
      }
    }
    if (alterationItems.filter((l) => l.photo).length > 3) {
      return NextResponse.json({ error: 'Please add at most 3 photos per booking.' }, { status: 400 });
    }
    const buttonsOnly = buttonsOnlyError({
      itemKeys: [...validated.services.dry_clean_items.map((i) => i.garment_type), ...alterationItems.map((l) => l.garment_type)],
      hasLaundry: validated.services.estimated_weight_lbs > 0 && validated.services.type !== 'dry_clean',
    });
    if (buttonsOnly) return NextResponse.json({ error: buttonsOnly }, { status: 400 });
    const hasAlterations = alterationItems.length > 0;

    // 2. Validate 24-Hour Express Eligibility & Item Exclusions
    const isExpress = validated.schedule.express_tier === 'express_24hr';
    if (isExpress && hasAlterations) {
      return NextResponse.json(
        { error: "24-Hour Express and alterations can't share an order. Book the alterations as a separate order, or choose 48-Hour Standard." },
        { status: 400 }
      );
    }
    if (isExpress) {
      if (!zone.expressEligible) {
        return NextResponse.json(
          {
            error: `24-Hour Express is not available in ${zone.name}. Please select 48-Hour Standard pickup.`,
            zone,
          },
          { status: 400 }
        );
      }

      const excludedItem = validated.services.dry_clean_items.find((item) => isExpressExcluded(item.garment_type));
      if (excludedItem) {
        return NextResponse.json(
          {
            error: `24-Hour Express is not available for orders containing specialty items (${excludedItem.garment_type}). Please select 48-Hour Standard pickup.`,
          },
          { status: 400 }
        );
      }
    }

    // 3. Server-Side Promo Code Validation
    let promoDiscountPercent = 0;
    let promoDiscountAmount: number | undefined;
    let verifiedPromoCode: string | null = null;
    // True when the code has a promo_codes row, so a use must be reserved atomically (SEC-15)
    let promoNeedsReservation = false;
    if (referral) {
      promoDiscountAmount = REFERRAL_AMOUNT;
    } else if (validated.pricing.promo_code) {
      const cleanPromo = validated.pricing.promo_code.toUpperCase().trim();
      let promoRow: {
        discount_type: string;
        discount_value: number;
        max_uses: number | null;
        current_uses: number | null;
        valid_from: string | null;
        valid_until: string | null;
      } | null = null;

      if (isSupabaseConfigured) {
        try {
          const adminSupabase = createAdminClient();
          const { data } = await adminSupabase
            .from('promo_codes')
            .select('discount_type, discount_value, max_uses, current_uses, valid_from, valid_until')
            .eq('code', cleanPromo)
            .eq('is_active', true)
            .maybeSingle();
          promoRow = data;
        } catch (promoErr) {
          console.warn('Server promo verification fallback:', promoErr);
        }
      }

      if (promoRow) {
        const now = new Date();
        const validDates = (!promoRow.valid_from || new Date(promoRow.valid_from) <= now) &&
          (!promoRow.valid_until || new Date(promoRow.valid_until) >= now);
        const validUses = promoRow.max_uses === null || (promoRow.current_uses || 0) < promoRow.max_uses;
        if (validDates && validUses) {
          // Fixed codes are dollar amounts, not percentages (SEC-15)
          if (promoRow.discount_type === 'fixed') {
            promoDiscountAmount = Number(promoRow.discount_value) || 0;
          } else {
            promoDiscountPercent = Number(promoRow.discount_value) || 0;
          }
          verifiedPromoCode = cleanPromo;
          promoNeedsReservation = true;
        }
      } else if (cleanPromo === PROMO_CODE_LAUNCH) {
        // Built-in launch code when it has no promo_codes row
        promoDiscountPercent = PROMO_DISCOUNT_PERCENT;
        verifiedPromoCode = PROMO_CODE_LAUNCH;
      }
    }

    // 4. Authoritatively Recompute Financials (F006 & F005 Fix)
    const computed = computeBookingFinancials({
      dryCleanItems: validated.services.dry_clean_items,
      alterationItems: alterationItems.map((line) => ({
        garment_type: line.garment_type,
        quantity: line.quantity,
        notes: [instructionText(line.instruction), line.notes?.trim() ? `Notes: ${line.notes.trim()}` : null].filter(Boolean).join(' · '),
        details: { instruction: line.instruction, ...(line.notes?.trim() ? { notes: line.notes.trim() } : {}) },
      })),
      weightLbs: validated.services.estimated_weight_lbs,
      isExpress,
      promoDiscountPercent,
      promoDiscountAmount,
      frequency: planFrequency,
      extendedReachFee: reachFee,
      planDiscountPercent: founderActive && planFrequency !== 'one_time' ? planDiscountFor(planFrequency, founder) : undefined,
    });

    // 5. Enforce Zone Minimum (F010 Fix). Zone 5: the minimum is on the garments; the delivery
    // fee is on top. Members: at member prices, and Zone 1's is 15 lb at their rate (2026-10-08).
    const minimumOrder = memberZoneMinimum(zone, planFrequency);
    const zoneMinimumGap = orderMinimumGap(computed.subtotal, zone, planFrequency, computed.alterationSubtotal);
    if (zoneMinimumGap > 0) {
      return NextResponse.json(
        {
          error:
            planFrequency === 'one_time'
              ? `Order subtotal ($${computed.subtotal.toFixed(2)}) is below the $${zone.minimumOrder.toFixed(2)} minimum for ${zone.name}. Please add $${zoneMinimumGap.toFixed(2)} more to place your order.`
              : `This order is below the $${minimumOrder.toFixed(2)} Routine member minimum for ${zone.name}. Please add $${zoneMinimumGap.toFixed(2)} more (at member prices) to place your order.`,
          zone,
          subtotal: computed.subtotal,
          gap: zoneMinimumGap,
        },
        { status: 400 }
      );
    }

    // 5b. Server-side schedule rules in Dallas time: notice period, Sunday closure, Express
    // weekdays / morning window / 7 AM & 9 PM cutoffs, 60-day horizon (PR-12)
    const todayTexasStr = texasDate();
    const scheduleCheck = validateSchedule({
      pickupDate: validated.schedule.pickup_date,
      pickupWindow: validated.schedule.pickup_window,
      tier: validated.schedule.express_tier,
      extraDaysAhead: founderActive ? FOUNDER_HEAD_START_DAYS : 0,
    });
    if (!scheduleCheck.ok) {
      return NextResponse.json({ error: scheduleCheck.error }, { status: 400 });
    }

    // Route days: Zone 3 Mon & Thu, Zone 4 Tue & Fri, Zone 5 its bi-weekly run dates (which
    // close a few days ahead, so the threshold is decided before any card hold)
    if (band) {
      const earliestRun = earliestExtendedReachRun(todayTexasStr, coverage.extendedReach);
      if (!earliestRun) {
        return NextResponse.json({ error: extendedReachStartLine(coverage.extendedReach), code: 'WAITLIST' }, { status: 400 });
      }
      if (validated.schedule.pickup_date < earliestRun || !isZoneRouteDay(zone, validated.schedule.pickup_date, coverage)) {
        return NextResponse.json(
          { error: `Extended Reach pickups run on ${coverage.extendedReach.routeDay}s. The next one you can book is ${formatLongDate(nextZoneRouteDay(zone, earliestRun, coverage))}.` },
          { status: 400 }
        );
      }
    } else if (!isZoneRouteDay(zone, validated.schedule.pickup_date, coverage)) {
      return NextResponse.json(
        { error: `${zone.name} is serviced on ${zone.routeDays.join(', ')}. Please select an active route day.` },
        { status: 400 }
      );
    }

    // 6. Delivery date: 2 plant days after pickup (Express: 1; alterations 5, returned together);
    // the plant runs Mon-Fri. Zones 3 and 4 deliver on their next route day.
    const deliveryDateStr = zoneDeliveryDate(zone, validated.schedule.pickup_date, isExpress ? 'express_24hr' : 'standard', {
      alterations: hasAlterations,
    }, coverage);
    const orderNumber = `F11-${todayTexasStr.slice(0, 4)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    let isGuest = true;

    // The amount held on the card for this estimate, and the hold once placed (Part A)
    const holdAmount = holdAmountFor(computed.financials.finalTotal, minimumOrder);
    let placedHold: { paymentId: string; expiresAt: string | null } | null = null;
    const releaseUnusedHold = async () => {
      if (!placedHold) return;
      const released = await cancelHold(squareConfig, placedHold.paymentId);
      if (!released.ok) {
        reportError('api/bookings', released.error, { alert: true, details: `Release Square hold ${placedHold.paymentId} by hand: its booking was not saved` });
      }
      placedHold = null;
    };

    if (isSupabaseConfigured) {
      try {
        const supabase = createAdminClient();

        // 0a. Same checkout submitted again (double click, retry after a timeout): return the
        // order it already created, without saving the card or notifying again (PR-11)
        if (validated.idempotency_key) {
          const { data: previous } = await supabase
            .from('orders')
            .select('id, order_number, total, status')
            .eq('idempotency_key', validated.idempotency_key)
            .maybeSingle();
          if (previous) {
            return NextResponse.json({
              success: true,
              replay: true,
              order: previous,
              order_number: previous.order_number,
              message: 'Your pickup has been confirmed and scheduled!',
            });
          }
        }

        // 0b. Quick capacity check so a full day fails before the card is saved. create_booking
        // re-checks under a lock, which is what actually prevents overbooking (PR-10).
        const [{ count: bookedInWindow }, { count: bookedInExpress }] = await Promise.all([
          supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('pickup_date', validated.schedule.pickup_date)
            .eq('pickup_window', validated.schedule.pickup_window)
            .neq('status', 'cancelled'),
          isExpress
            ? supabase
                .from('orders')
                .select('id', { count: 'exact', head: true })
                .eq('pickup_date', validated.schedule.pickup_date)
                .eq('express_tier', 'express_24hr')
                .neq('status', 'cancelled')
            : Promise.resolve({ count: 0 }),
        ]);

        if ((bookedInWindow ?? 0) >= WINDOW_CAPACITY) {
          const refusal = bookingRefusal('window_full', validated.schedule, verifiedPromoCode);
          return NextResponse.json({ error: refusal.error }, { status: refusal.status });
        }

        if (isExpress && (bookedInExpress ?? 0) >= EXPRESS_DAILY_SLOT_CAP) {
          const refusal = bookingRefusal('express_full', validated.schedule, verifiedPromoCode);
          return NextResponse.json({ error: refusal.error }, { status: refusal.status });
        }

        const authClient = await createClient();
        const {
          data: { user },
        } = await authClient.auth.getUser();

        if (user) {
          isGuest = false;
        }

        // 1. Resolve Customer ID
        let customerId: string | null = null;

        if (user) {
          const { data: existingCust } = await supabase
            .from('customers')
            .select('id')
            .eq('auth_id', user.id)
            .maybeSingle();

          if (existingCust) {
            customerId = existingCust.id;
          }
        }

        if (!customerId) {
          const { data: custByEmail } = await supabase
            .from('customers')
            .select('id, auth_id')
            .eq('email', validated.customer.email)
            .maybeSingle();

          if (custByEmail?.auth_id) {
            // A registered account owns this email: only its owner, signed in, may book on it (SEC-11)
            return NextResponse.json(
              { error: 'An account already exists for this email. Please log in to book.', code: 'ACCOUNT_EXISTS' },
              { status: 409 }
            );
          }

          if (custByEmail) {
            // Returning guest. Their saved SMS consent is never changed by an unauthenticated
            // booking (SEC-11); this booking's own consent still applies to its notifications.
            customerId = custByEmail.id;
          } else {
            const { data: newCust, error: custErr } = await supabase
              .from('customers')
              .insert({
                auth_id: user?.id || null,
                email: validated.customer.email,
                full_name: validated.customer.full_name,
                phone: validated.customer.phone,
                sms_consent: validated.consents.sms_order_updates,
                sms_promotions_consent: validated.consents.sms_promotions,
                sms_consent_at: validated.consents.sms_order_updates ? new Date().toISOString() : null,
              })
              .select('id')
              .single();

            if (!custErr && newCust) {
              customerId = newCust.id;
            } else {
              console.error('[Bookings] Customer insert failed:', custErr);
            }
          }
        }

        if (customerId) {
          // 1a. One use per customer per promo code (SEC-15)
          if (verifiedPromoCode) {
            if (await hasUsedPromo(supabase, customerId, verifiedPromoCode)) {
              const refusal = bookingRefusal('promo_used', validated.schedule, verifiedPromoCode);
              return NextResponse.json({ error: refusal.error }, { status: refusal.status });
            }
          }

          // Joining the Routine: one membership at a time (client 2026-10-08)
          if (routineCadence && (await getOpenMembership(supabase, customerId))) {
            return NextResponse.json(
              { error: `You're already in the Routine. Manage it from your dashboard: ${ROUTINE_PATH}`, code: 'ALREADY_MEMBER' },
              { status: 409 }
            );
          }

          // 1b. Save the card on file with Square before anything else is created (SEC-06).
          // A declined card stops the booking here.
          let savedCard: SavedCard | null = null;
          if (squareConfig.isLive && cardToken) {
            const { data: custSquare } = await supabase
              .from('customers')
              .select('square_customer_id')
              .eq('id', customerId)
              .maybeSingle();

            const cardResult = await saveCardOnFile(squareConfig, {
              cardToken,
              existingSquareCustomerId: custSquare?.square_customer_id,
              email: validated.customer.email,
              fullName: validated.customer.full_name,
              referenceId: customerId,
            });

            if (!cardResult.ok) {
              console.warn('Square card on file declined at booking:', cardResult.error);
              return NextResponse.json(
                { error: `Your card could not be verified: ${cardResult.error} Please check the details or try another card.` },
                { status: 402 }
              );
            }

            savedCard = cardResult.card;
            if (!custSquare?.square_customer_id) {
              await supabase
                .from('customers')
                .update({ square_customer_id: savedCard.squareCustomerId })
                .eq('id', customerId);
            }

            // 1c. Hold the estimate on the card (client 2026-10-06, Part A). A pickup within 2
            // days is held now, and a declined hold stops the booking; a later pickup is held by
            // the daily job 2 days before (Square cancels an uncaptured hold after 7 days).
            if (shouldPlaceHoldNow(validated.schedule.pickup_date)) {
              const placed = await createHold(squareConfig, {
                squareCustomerId: savedCard.squareCustomerId,
                cardId: savedCard.cardId,
                amount: holdAmount,
                orderNumber,
                // One hold per checkout: a retried submit gets the same Square payment back
                idempotencyKey: `hold_${(validated.idempotency_key || orderNumber).replace(/-/g, '')}`.slice(0, 45),
              });
              if (!placed.ok) {
                console.warn('Square hold declined at booking:', placed.error);
                return NextResponse.json(
                  { error: `Your card couldn't be authorized for the estimated total ($${holdAmount.toFixed(2)}): ${placed.error} Please try another card.` },
                  { status: 402 }
                );
              }
              placedHold = { paymentId: placed.paymentId, expiresAt: placed.expiresAt };
            }
          }

          // 2. Resolve or Insert Delivery Address (Address Deduplication)
          let addressId: string | null = null;

          const { data: existingAddress } = await supabase
            .from('addresses')
            .select('id')
            .eq('customer_id', customerId)
            .ilike('street', validated.address.street.trim())
            .eq('zip', validated.address.zip.trim())
            .maybeSingle();

          if (existingAddress) {
            addressId = existingAddress.id;
          } else {
            // Only set as default if customer has no default address yet
            const { count: defaultCount } = await supabase
              .from('addresses')
              .select('*', { count: 'exact', head: true })
              .eq('customer_id', customerId)
              .eq('is_default', true);

            const isFirstOrNoDefault = (defaultCount ?? 0) === 0;

            const { data: addressRow } = await supabase
              .from('addresses')
              .insert({
                customer_id: customerId,
                street: validated.address.street.trim(),
                unit: validated.address.unit || null,
                city: validated.address.city,
                state: validated.address.state,
                zip: validated.address.zip.trim(),
                delivery_notes: validated.address.delivery_notes || null,
                is_default: isFirstOrNoDefault,
              })
              .select('id')
              .single();

            addressId = addressRow?.id || null;
          }

          // 3. Create the order, its items and its first event in one transaction (PR-10).
          // create_booking locks the pickup day, re-checks window and Express capacity and the
          // one-use-per-customer promo rule, and reserves the promo use (SEC-15); if any step
          // fails nothing is saved, so a promo use is never consumed by a booking that failed.
          const deliveryWindow = isExpress ? 'morning' : validated.schedule.pickup_window;
          const { data: booking, error: bookingErr } = await supabase.rpc('create_booking', {
            p: {
              idempotency_key: validated.idempotency_key ?? null,
              window_capacity: WINDOW_CAPACITY,
              express_capacity: EXPRESS_DAILY_SLOT_CAP,
              reserve_promo: promoNeedsReservation,
              order: {
                order_number: orderNumber,
                customer_id: customerId,
                address_id: addressId,
                order_type: validated.services.type,
                pickup_date: validated.schedule.pickup_date,
                pickup_window: validated.schedule.pickup_window,
                delivery_date: deliveryDateStr,
                delivery_window: deliveryWindow,
                weight_lbs: validated.services.estimated_weight_lbs || null,
                subtotal: computed.subtotal,
                express_tier: validated.schedule.express_tier,
                promo_code: verifiedPromoCode,
                discount_amount: computed.financials.discountAmount,
                // What the quote was made of, for tax filing and reconciliation (PR-15)
                express_surcharge: computed.financials.expressSurcharge,
                environmental_fee: computed.financials.environmentalFee,
                sales_tax: computed.financials.salesTax,
                total: computed.financials.finalTotal,
                // Never 'charged' at booking (SEC-05): the saved card is charged at intake.
                // payment_id is filled with the Square payment ID once intake charges it.
                payment_id: null,
                // 'authorized' = the estimate is held on the card; 'pending' = card saved, hold
                // placed 2 days before pickup (or Square isn't configured locally)
                payment_status: placedHold ? 'authorized' : 'pending',
                square_customer_id: savedCard?.squareCustomerId || null,
                square_card_id: savedCard?.cardId || null,
                hold_payment_id: placedHold?.paymentId ?? null,
                hold_amount: savedCard ? holdAmount : null,
                hold_expires_at: placedHold?.expiresAt ?? null,
                hold_status: placedHold ? 'held' : savedCard ? 'scheduled' : 'none',
                payment_terms_accepted_at: new Date().toISOString(),
                payment_terms_version: PAYMENT_TERMS_VERSION,
                zone_id: zone.id,
                distance_miles: resolution.miles,
                extended_reach_band: band?.id ?? null,
                extended_reach_fee: reachFee,
                frequency: planFrequency,
                notes: [
                  validated.address.delivery_notes,
                  planFrequency !== 'one_time'
                    ? `Recurring Plan: ${planFrequency === 'weekly' ? 'Weekly' : 'Bi-Weekly'}`
                    : null,
                  band ? `${EXTENDED_REACH_LABEL} (Band ${band.id}): $${reachFee.toFixed(2)}${isRoutine ? ' (Routine member)' : ''}` : null,
                ].filter(Boolean).join(' | ') || null,
              },
              // Authoritative computed item list
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
              event: {
                note: `Pickup scheduled for ${validated.schedule.pickup_date} (${validated.schedule.pickup_window === 'morning' ? '7:30-10:00 AM' : '5:00-8:00 PM'})`,
                triggered_by: 'Customer (Web Booking)',
              },
            },
          });

          const result = booking as CreateBookingResult | null;
          if (!bookingErr && result && !result.ok) {
            await releaseUnusedHold();
            const refusal = bookingRefusal(result.error, validated.schedule, verifiedPromoCode);
            return NextResponse.json({ error: refusal.error }, { status: refusal.status });
          }

          if (!bookingErr && result?.ok) {
            const insertedOrder = result.order;
            if (placedHold && !result.replay) {
              await supabase.from('order_payments').insert({
                order_id: insertedOrder.id,
                square_payment_id: placedHold.paymentId,
                kind: 'hold',
                amount: holdAmount,
                status: 'approved',
                note: 'Hold for the estimated total, placed at booking',
              });
            }
            // General repair photos, attached to the order's Garment Passport (Parts B-D)
            if (!result.replay) {
              for (const line of alterationItems.filter((l) => l.photo)) {
                const url = await resolveAndUploadPhotoUrl(line.photo, insertedOrder.id, 'customer_reference');
                if (!url) continue; // an unreadable photo never blocks the booking
                await supabase.from('garment_photos').insert({
                  order_id: insertedOrder.id,
                  photo_type: 'customer_reference',
                  photo_url: url,
                  condition_notes: `Customer photo for ${DRY_CLEAN_PRICES[line.garment_type]?.label || line.garment_type}: ${line.instruction.type === 'description' ? line.instruction.text : ''}`.trim(),
                  captured_by: 'Customer (Web Booking)',
                });
              }
            }
            if (result.replay) {
              // A concurrent submit of the same checkout got there first
              return NextResponse.json({
                success: true,
                replay: true,
                order: insertedOrder,
                order_number: insertedOrder.order_number,
                message: 'Your pickup has been confirmed and scheduled!',
              });
            }

            // A friend's referral: the discount on this first order, and the referral, so the
            // friend earns $15 of credit once it's delivered (client 2026-10-10)
            if (referral) {
              await supabase.from('orders').update({ referral_code: referral.code, referral_discount: REFERRAL_AMOUNT }).eq('id', insertedOrder.id);
              await recordReferral(supabase, { referrerId: referral.referrerId, referredId: customerId, orderId: insertedOrder.id, code: referral.code });
            }

            // Joining the Routine (client 2026-10-08): this booking is the first pickup. The
            // membership needs an account behind it, made silently (sign-in is a text code or
            // email link, no password)
            let routine: { cadence: RoutineCadence; next_pickup_date: string; founder?: { number: number; territory: string } } | null = null;
            if (routineCadence) {
              const membership = await createMembershipFromBooking(supabase, {
                customerId,
                orderId: insertedOrder.id,
                cadence: routineCadence,
                pickupDate: validated.schedule.pickup_date,
                pickupWindow: validated.schedule.pickup_window,
                addressId,
                template: {
                  zone_id: zone.id,
                  extended_reach_band: band?.id ?? null,
                  order_type: validated.services.type,
                  // Alterations are one-offs: each automatic pickup is the cleaning only
                  services: {
                    type: validated.services.type,
                    dry_clean_items: validated.services.dry_clean_items,
                    estimated_weight_lbs: validated.services.estimated_weight_lbs,
                  },
                },
                squareCustomerId: savedCard?.squareCustomerId ?? null,
                squareCardId: savedCard?.cardId ?? null,
              });
              if (membership) {
                routine = { cadence: routineCadence, next_pickup_date: membership.next_pickup_date };
                // One of the first 111 in their territory: a Founding member (client 2026-10-10)
                const founding = await claimFounding(supabase, { customerId, membershipId: membership.id, zip: validated.address.zip });
                if (founding) routine.founder = { number: founding.number, territory: founding.territoryName };
                const { data: member } = await supabase.from('customers').select('id, email, full_name, role, auth_id, phone').eq('id', customerId).maybeSingle();
                if (member && !member.auth_id && member.role === 'customer') {
                  try {
                    await ensureAuthUser(supabase, member);
                  } catch (accountErr) {
                    reportError('routine/account', accountErr, { details: `Customer ${customerId}: Routine account not created; they can still sign in by email link` });
                  }
                }
              }
            }
            const routineLine = routine
              ? `You're in the ${CADENCE_LABEL[routine.cadence]} Routine: next pickup ${formatLongDate(routine.next_pickup_date)}.${routine.founder ? ` You're Founding Member #${routine.founder.number} in ${routine.founder.territory}.` : ''} Manage it anytime at ${getAppBaseUrl()}${ROUTINE_PATH}.`
              : undefined;

            // Zone 5: where this run stands now (this booking included). It's confirmed when the
            // threshold is met or a delivery is already due that day; reaching it tells
            // everyone picked up on the run (client, revised). Otherwise this customer gets the
            // client's "you're on the list" text after the confirmation (2026-10-08)
            let routeThreshold: { booked: number; threshold: number; deliveriesDue: number; dispatched: boolean } | undefined;
            let zone5Followup: () => Promise<void> = async () => {};
            if (band) {
              const [booked, deliveriesDue, dispatched] = await Promise.all([
                runBookingCount(supabase, validated.schedule.pickup_date, band.id),
                runDeliveriesDue(supabase, validated.schedule.pickup_date, band.id),
                isRunDispatched(supabase, validated.schedule.pickup_date, band.id),
              ]);
              routeThreshold = { booked, threshold: bandThreshold(coverage.extendedReach, band.id), deliveriesDue, dispatched };
              const run = { runDate: validated.schedule.pickup_date, band: band.id, reach: coverage.extendedReach };
              zone5Followup = async () => {
                const outcome = await dispatchRunIfReady(supabase, run);
                if (!outcome.dispatched) await sendOnTheList(supabase, { ...run, orderId: insertedOrder.id });
              };
            }

            // 7. Dispatch stage notification for 'booked' (sends SMS/WhatsApp and/or Resend email)
            // Sent after the response, kept alive until it finishes (PR-17)
            const origin = getAppBaseUrl();
            runAfterResponse(async () => {
              try {
                await messagingService.dispatchStageNotification({
                  orderId: insertedOrder.id,
                  orderNumber: orderNumber,
                  customerName: validated.customer.full_name,
                  customerPhone: validated.customer.phone,
                  customerEmail: validated.customer.email,
                  smsConsent: validated.consents.sms_order_updates,
                  stage: 'booked',
                  pickupDate: validated.schedule.pickup_date,
                  pickupWindow: validated.schedule.pickup_window,
                  deliveryDate: deliveryDateStr,
                  deliveryWindow,
                  weightLbs: validated.services.estimated_weight_lbs,
                  total: computed.financials.finalTotal,
                  trackingUrl: `${origin}/track/${insertedOrder.id}`,
                  // Guests get an account invitation in the email (CLAUDE.md 5A, P05 AR-14)
                  signupUrl: isGuest ? `${origin}${ROUTES.signup}?email=${encodeURIComponent(validated.customer.email)}` : undefined,
                  ...(hasAlterations ? { returnsTogetherOn: deliveryDateStr } : { deliveredOn: formatLongDate(deliveryDateStr) }),
                  ...(routeThreshold ? { routeThresholdLine: runStatusLine(routeThreshold, coverage.extendedReach) } : {}),
                  ...(routineLine ? { routineLine } : {}),
                });
              } finally {
                // Zone 5: the run's texts come after the confirmation
                await zone5Followup();
              }
            }, 'booking confirmation');

            return NextResponse.json({
              success: true,
              order: {
                ...insertedOrder,
                subtotal: computed.subtotal,
                total: computed.financials.finalTotal,
                express_surcharge: computed.financials.expressSurcharge,
                sales_tax: computed.financials.salesTax,
                environmental_fee: computed.financials.environmentalFee,
                extended_reach_fee: computed.financials.extendedReachFee,
                delivery_date: deliveryDateStr,
                zone_id: zone.id,
              },
              ...(routeThreshold ? { route_threshold: routeThreshold } : {}),
              ...(routine ? { routine } : {}),
              order_number: orderNumber,
              message: 'Your pickup has been confirmed and scheduled!',
            });
          }
          console.error('[Bookings] create_booking failed:', bookingErr || result);
        } else {
          console.error('[Bookings] Could not resolve or create the customer record.');
        }
      } catch (dbErr) {
        console.error('Supabase booking insert error:', dbErr);
      }

      // Reaching here means the booking was NOT saved (SEC-12). Never send a fake
      // confirmation: tell the customer, and send no SMS or email. Release any hold placed.
      await releaseUnusedHold();
      reportError('api/bookings', 'A customer booking could not be saved (see the [Bookings] log lines for the cause)', { alert: true });
      return NextResponse.json(
        {
          error:
            "We couldn't save your booking. Your card hasn't been charged. Please try again, or call us to schedule your pickup.",
        },
        { status: 503 }
      );
    }

    if (process.env.NODE_ENV === 'production') {
      console.error('[Bookings] Supabase is not configured in production; refusing mock booking.');
      return NextResponse.json(
        { error: 'Online booking is temporarily unavailable. Please call us to schedule your pickup.' },
        { status: 503 }
      );
    }

    // Local mock mode only (Supabase not configured, outside production)
    const orderId = crypto.randomUUID();
    const createdOrder: Order = {
      id: orderId,
      customer_id: 'c0000000-0000-0000-0000-000000000001',
      address_id: crypto.randomUUID(),
      status: 'booked',
      order_type: validated.services.type,
      pickup_date: validated.schedule.pickup_date,
      pickup_window: validated.schedule.pickup_window,
      delivery_date: deliveryDateStr,
      delivery_window: isExpress ? 'morning' : validated.schedule.pickup_window,
      weight_lbs: validated.services.estimated_weight_lbs || null,
      subtotal: computed.subtotal,
      express_tier: validated.schedule.express_tier,
      promo_code: verifiedPromoCode,
      discount_amount: computed.financials.discountAmount,
      total: computed.financials.finalTotal,
      payment_id: null,
      payment_status: 'pending',
      notes: validated.address.delivery_notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Dispatch stage notification in fallback mode
    // Sent after the response, kept alive until it finishes (PR-17)
    const origin = getAppBaseUrl();
    runAfterResponse(
      () =>
        messagingService.dispatchStageNotification({
          orderId: createdOrder.id,
          orderNumber: orderNumber,
          customerName: validated.customer.full_name,
          customerPhone: validated.customer.phone,
          customerEmail: validated.customer.email,
          smsConsent: validated.consents.sms_order_updates,
          stage: 'booked',
          pickupDate: validated.schedule.pickup_date,
          pickupWindow: validated.schedule.pickup_window,
          deliveryDate: deliveryDateStr,
          deliveryWindow: isExpress ? 'morning' : validated.schedule.pickup_window,
          weightLbs: validated.services.estimated_weight_lbs,
          total: computed.financials.finalTotal,
          trackingUrl: `${origin}/track/${createdOrder.id}`,
          signupUrl: isGuest ? `${origin}${ROUTES.signup}?email=${encodeURIComponent(validated.customer.email)}` : undefined,
          ...(hasAlterations ? { returnsTogetherOn: deliveryDateStr } : { deliveredOn: formatLongDate(deliveryDateStr) }),
          ...(band ? { routeThresholdLine: `${dispatchThresholdMessage(1, band.dispatchThreshold)} ${extendedReachTurnaroundLine(coverage.extendedReach)}` } : {}),
      }),
      'booking confirmation'
    );

    return NextResponse.json({
      success: true,
      order: {
        ...createdOrder,
        subtotal: computed.subtotal,
        total: computed.financials.finalTotal,
        express_surcharge: computed.financials.expressSurcharge,
        sales_tax: computed.financials.salesTax,
        environmental_fee: computed.financials.environmentalFee,
        extended_reach_fee: computed.financials.extendedReachFee,
        delivery_date: deliveryDateStr,
        zone_id: zone.id,
        is_guest: isGuest,
      },
      ...(band ? { route_threshold: { booked: 1, threshold: band.dispatchThreshold, deliveriesDue: 0, dispatched: false } } : {}),
      order_number: orderNumber,
      message: 'Your pickup has been confirmed and scheduled!',
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Please check your booking details.' },
        { status: 400 }
      );
    }
    return apiError('api/bookings', err, 400);
  }
}
