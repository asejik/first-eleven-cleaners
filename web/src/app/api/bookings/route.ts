import { NextResponse } from 'next/server';
import { z } from 'zod';
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

const BookingSchema = z.object({
  customer: z.object({
    full_name: z.string().min(2),
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

    const isSupabaseConfigured =
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

    // Square card pre-authorization token gating for production abuse prevention (F001 Fix)
    const isSquareConfigured =
      Boolean(process.env.SQUARE_ACCESS_TOKEN) &&
      !process.env.SQUARE_ACCESS_TOKEN?.includes('your-token');

    if (isSquareConfigured && process.env.NODE_ENV === 'production') {
      const token = validated.payment_method?.payment_token;
      if (!token || token.startsWith('sim_')) {
        return NextResponse.json(
          { error: 'A verified payment card token is required to schedule a pickup.' },
          { status: 400 }
        );
      }
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
    let verifiedPromoCode: string | null = null;
    if (validated.pricing.promo_code) {
      const cleanPromo = validated.pricing.promo_code.toUpperCase().trim();
      if (cleanPromo === PROMO_CODE_LAUNCH) {
        promoDiscountPercent = PROMO_DISCOUNT_PERCENT;
        verifiedPromoCode = PROMO_CODE_LAUNCH;
      } else if (isSupabaseConfigured) {
        try {
          const adminSupabase = createAdminClient();
          const { data: promoRow } = await adminSupabase
            .from('promo_codes')
            .select('code, discount_value, max_uses, current_uses, valid_from, valid_until, is_active')
            .eq('code', cleanPromo)
            .eq('is_active', true)
            .maybeSingle();

          if (promoRow) {
            const now = new Date();
            const validDates = (!promoRow.valid_from || new Date(promoRow.valid_from) <= now) &&
              (!promoRow.valid_until || new Date(promoRow.valid_until) >= now);
            const validUses = promoRow.max_uses === null || (promoRow.current_uses || 0) < promoRow.max_uses;
            if (validDates && validUses) {
              promoDiscountPercent = Number(promoRow.discount_value) || 0;
              verifiedPromoCode = cleanPromo;
            }
          }
        } catch (promoErr) {
          console.warn('Server promo verification fallback:', promoErr);
        }
      }
    }

    // 4. Authoritatively Recompute Financials (F006 & F005 Fix)
    const computed = computeBookingFinancials({
      dryCleanItems: validated.services.dry_clean_items,
      weightLbs: validated.services.estimated_weight_lbs,
      isExpress,
      promoDiscountPercent,
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

    // 6. Calculate Delivery Date (24 hours next-day for Express, 48 hours standard, skip Sunday)
    const pickup = new Date(validated.schedule.pickup_date + 'T12:00:00');
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
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `F11-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    let isGuest = true;

    if (isSupabaseConfigured) {
      try {
        const authClient = await createClient();
        const {
          data: { user },
        } = await authClient.auth.getUser();

        if (user) {
          isGuest = false;
        }

        const supabase = createAdminClient();

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
            .select('id')
            .eq('email', validated.customer.email)
            .maybeSingle();

          if (custByEmail) {
            customerId = custByEmail.id;
          } else {
            const { data: newCust, error: custErr } = await supabase
              .from('customers')
              .insert({
                auth_id: user?.id || null,
                email: validated.customer.email,
                full_name: validated.customer.full_name,
                phone: validated.customer.phone,
              })
              .select('id')
              .single();

            if (!custErr && newCust) {
              customerId = newCust.id;
            }
          }
        }

        if (customerId) {
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
                is_default: true,
              })
              .select('id')
              .single();

            addressId = addressRow?.id || null;
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
              payment_id: validated.payment_method?.payment_token || `sq_sim_${randomSuffix}`,
              payment_status: validated.services.type === 'wash_fold' ? 'authorized' : 'charged',
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
              await supabase.from('order_items').insert(itemsToInsert);
            }

            // 5. Insert Initial Booking Event
            await supabase.from('order_events').insert({
              order_id: insertedOrder.id,
              status: 'booked',
              note: `Pickup scheduled for ${validated.schedule.pickup_date} (${validated.schedule.pickup_window === 'morning' ? '7:30-10:00 AM' : '5:00-8:00 PM'})`,
              triggered_by: 'Customer (Web Booking)',
            });

            // 6. Increment promo code usage count in database if verified promo was used
            if (verifiedPromoCode) {
              try {
                const { data: promoRow } = await supabase
                  .from('promo_codes')
                  .select('id, current_uses')
                  .eq('code', verifiedPromoCode)
                  .maybeSingle();

                if (promoRow) {
                  await supabase
                    .from('promo_codes')
                    .update({ current_uses: (promoRow.current_uses || 0) + 1 })
                    .eq('id', promoRow.id);
                }
              } catch (promoErr) {
                console.warn('Failed to increment promo code usage counter:', promoErr);
              }
            }

            // 7. Dispatch stage notification for 'booked' (sends SMS/WhatsApp and/or Resend email)
            try {
              const origin = getAppBaseUrl();
              messagingService.dispatchStageNotification({
                orderId: insertedOrder.id,
                orderNumber: orderNumber,
                customerName: validated.customer.full_name,
                customerPhone: validated.customer.phone,
                customerEmail: validated.customer.email,
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
        }
      } catch (dbErr) {
        console.error('Supabase booking insert error:', dbErr);
        // Fall through to mock order return
      }
    }

    // Fallback response if Supabase is offline
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
      payment_id: validated.payment_method?.payment_token || `sq_tok_${crypto.randomUUID().slice(0, 8)}`,
      payment_status: validated.services.type === 'wash_fold' ? 'authorized' : 'charged',
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
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }
}
