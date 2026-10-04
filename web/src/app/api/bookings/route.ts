import { NextResponse } from 'next/server';
import { z } from 'zod';
import { personNameSchema } from '@/lib/sanitize';
import type { Order } from '@/types';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { messagingService } from '@/lib/messaging';
import {
  getAppBaseUrl,
  resolveZoneByZip,
  getZoneMinimumGap,
  EXPRESS_EXCLUDED_GARMENTS,
  PROMO_CODE_LAUNCH,
  PROMO_DISCOUNT_PERCENT,
  computeBookingFinancials,
} from '@/lib/constants';
import { getSquareConfig, saveCardOnFile, type SavedCard } from '@/lib/square';

const BookingSchema = z.object({
  customer: z.object({
    full_name: personNameSchema,
    email: z.string().email(),
    phone: z.string().min(7),
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
  }).default({ sms_order_updates: false, sms_promotions: false }),
});

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
      return NextResponse.json(
        { error: 'Online booking is temporarily unavailable. Please call us to schedule your pickup.' },
        { status: 503 }
      );
    }

    // 1. Resolve Zone & Validate Delivery Coverage
    const zone = resolveZoneByZip(validated.address.zip);
    if (!zone) {
      return NextResponse.json(
        {
          error: `ZIP code ${validated.address.zip} is outside our Dallas–Fort Worth Metroplex service area. We currently serve Dallas, Collin, Tarrant, Denton, and surrounding North Texas communities.`,
        },
        { status: 400 }
      );
    }

    // 2. Validate 24-Hour Express Eligibility & Item Exclusions
    const isExpress = validated.schedule.express_tier === 'express_24hr';
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

      const excludedItem = validated.services.dry_clean_items.find((item) =>
        (EXPRESS_EXCLUDED_GARMENTS as readonly string[]).includes(item.garment_type)
      );
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
    if (validated.pricing.promo_code) {
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
      weightLbs: validated.services.estimated_weight_lbs,
      isExpress,
      promoDiscountPercent,
      promoDiscountAmount,
      frequency: validated.schedule.frequency,
    });

    // 5. Enforce Zone Minimum (F010 Fix)
    const zoneMinimumGap = getZoneMinimumGap(computed.subtotal, zone);
    if (zoneMinimumGap > 0) {
      return NextResponse.json(
        {
          error: `Order subtotal ($${computed.subtotal.toFixed(2)}) is below the $${zone.minimumOrder.toFixed(2)} minimum for ${zone.name}. Please add $${zoneMinimumGap.toFixed(2)} more to place your order.`,
          zone,
          subtotal: computed.subtotal,
          gap: zoneMinimumGap,
        },
        { status: 400 }
      );
    }

    // 5b. Server-Side Pickup Date Validation (F005 Fix)
    const todayTexasStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    if (validated.schedule.pickup_date < todayTexasStr) {
      return NextResponse.json(
        { error: 'Pickup date cannot be in the past. Please select an upcoming service date.' },
        { status: 400 }
      );
    }

    const pickup = new Date(validated.schedule.pickup_date + 'T12:00:00');
    const dayOfWeek = pickup.getDay();
    if (dayOfWeek === 0) {
      return NextResponse.json(
        { error: 'Our processing hub is closed on Sundays for maintenance. Please choose Monday through Saturday.' },
        { status: 400 }
      );
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
    const selectedDayName = dayNames[dayOfWeek];
    if (!(zone.routeDays as readonly string[]).includes(selectedDayName)) {
      return NextResponse.json(
        { error: `${zone.name} is serviced on ${zone.routeDays.join(', ')}. Please select an active route day.` },
        { status: 400 }
      );
    }

    // 6. Calculate Delivery Date (24 hours next-day for Express, 48 hours standard, skip Sunday)
    const delivery = new Date(pickup);
    if (isExpress) {
      delivery.setDate(delivery.getDate() + 1); // 24 hours: next morning
    } else {
      delivery.setDate(delivery.getDate() + 2); // 48 hours standard
    }

    if (delivery.getDay() === 0) {
      delivery.setDate(delivery.getDate() + 1); // If Sunday, deliver Monday
    }

    const deliveryDateStr = delivery.toISOString().split('T')[0];
    const orderNumber = `F11-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    let isGuest = true;

    if (isSupabaseConfigured) {
      try {
        const supabase = createAdminClient();

        // 0. Enforce Route & Express Capacity (F005 Fix)
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

        if ((bookedInWindow ?? 0) >= 25) {
          return NextResponse.json(
            { error: `The ${validated.schedule.pickup_window} pickup window for ${validated.schedule.pickup_date} has reached full capacity. Please select another window or date.` },
            { status: 400 }
          );
        }

        if (isExpress && (bookedInExpress ?? 0) >= 8) {
          return NextResponse.json(
            { error: `24-Hour Express capacity for ${validated.schedule.pickup_date} has reached its daily limit of 8 orders. Please select 48-Hour Standard pickup.` },
            { status: 400 }
          );
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
            const { count: priorUses } = await supabase
              .from('orders')
              .select('id', { count: 'exact', head: true })
              .eq('customer_id', customerId)
              .eq('promo_code', verifiedPromoCode)
              .neq('status', 'cancelled');
            if ((priorUses ?? 0) > 0) {
              return NextResponse.json(
                { error: `Promo code ${verifiedPromoCode} has already been used on this account. Please remove it and try again.` },
                { status: 400 }
              );
            }
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

          // 2b. Reserve one promo use atomically so max_uses can't be exceeded by
          // simultaneous bookings (SEC-15)
          if (promoNeedsReservation && verifiedPromoCode) {
            const { data: reserved, error: reserveErr } = await supabase.rpc('reserve_promo_use', {
              p_code: verifiedPromoCode,
            });
            if (reserveErr || reserved !== true) {
              if (reserveErr) console.error('[Bookings] Promo reservation failed:', reserveErr);
              return NextResponse.json(
                { error: `Promo code ${verifiedPromoCode} has reached its usage limit. Please remove it and try again.` },
                { status: 409 }
              );
            }
          }

          // 3. Insert Order
          const { data: insertedOrder, error: orderErr } = await supabase
            .from('orders')
            .insert({
              order_number: orderNumber,
              customer_id: customerId,
              address_id: addressId,
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
              // Never 'charged' at booking (SEC-05): the saved card is charged at intake.
              // payment_id is filled with the Square payment ID once intake charges it.
              payment_id: null,
              payment_status: savedCard ? 'authorized' : 'pending',
              square_customer_id: savedCard?.squareCustomerId || null,
              square_card_id: savedCard?.cardId || null,
              notes: [
                validated.address.delivery_notes,
                validated.schedule.frequency && validated.schedule.frequency !== 'one_time'
                  ? `Recurring Plan: ${validated.schedule.frequency === 'weekly' ? 'Weekly' : 'Bi-Weekly'}`
                  : null,
              ].filter(Boolean).join(' | ') || null,
            })
            .select('id, order_number, total, status')
            .single();

          if (!orderErr && insertedOrder) {
            // 4. Insert Order Items from Authoritative Computed List
            const itemsToInsert = computed.itemizedList.map((item) => ({
              order_id: insertedOrder.id,
              garment_type: item.garment_type,
              service_type: item.service_type,
              quantity: item.quantity,
              unit_price: item.unit_price,
              subtotal: item.subtotal,
              notes: item.notes || null,
            }));

            if (itemsToInsert.length > 0) {
              const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
              if (itemsErr) console.error('[Bookings] Order items insert failed:', itemsErr);
            }

            // 5. Insert Initial Booking Event
            await supabase.from('order_events').insert({
              order_id: insertedOrder.id,
              status: 'booked',
              note: `Pickup scheduled for ${validated.schedule.pickup_date} (${validated.schedule.pickup_window === 'morning' ? '7:30-10:00 AM' : '5:00-8:00 PM'})`,
              triggered_by: 'Customer (Web Booking)',
            });

            // 7. Dispatch stage notification for 'booked' (sends SMS/WhatsApp and/or Resend email)
            try {
              const origin = getAppBaseUrl();
              messagingService.dispatchStageNotification({
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
                deliveryWindow: isExpress ? 'morning' : validated.schedule.pickup_window,
                weightLbs: validated.services.estimated_weight_lbs,
                total: computed.financials.finalTotal,
                trackingUrl: `${origin}/track/${insertedOrder.id}`,
              }).catch((notifyErr) => console.warn('Booking stage notification notice:', notifyErr));
            } catch (notifyErr) {
              console.warn('Booking stage notification error:', notifyErr);
            }

            return NextResponse.json({
              success: true,
              order: {
                ...insertedOrder,
                subtotal: computed.subtotal,
                total: computed.financials.finalTotal,
                express_surcharge: computed.financials.expressSurcharge,
                sales_tax: computed.financials.salesTax,
                environmental_fee: computed.financials.environmentalFee,
              },
              order_number: orderNumber,
              message: 'Your pickup has been confirmed and scheduled!',
            });
          }
          console.error('[Bookings] Order insert failed:', orderErr);
        } else {
          console.error('[Bookings] Could not resolve or create the customer record.');
        }
      } catch (dbErr) {
        console.error('Supabase booking insert error:', dbErr);
      }

      // Reaching here means the booking was NOT saved (SEC-12). Never send a fake
      // confirmation: tell the customer, and send no SMS or email.
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
    try {
      const origin = getAppBaseUrl();
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
      }).catch((notifyErr) => console.warn('Booking fallback stage notification notice:', notifyErr));
    } catch (notifyErr) {
      console.warn('Booking fallback notification error:', notifyErr);
    }

    return NextResponse.json({
      success: true,
      order: {
        ...createdOrder,
        subtotal: computed.subtotal,
        total: computed.financials.finalTotal,
        express_surcharge: computed.financials.expressSurcharge,
        sales_tax: computed.financials.salesTax,
        environmental_fee: computed.financials.environmentalFee,
        is_guest: isGuest,
      },
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
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }
}
