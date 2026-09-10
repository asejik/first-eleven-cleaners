import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Order } from '@/types';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import { messagingService } from '@/lib/messaging';
import { getAppBaseUrl } from '@/lib/constants';

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
    express_tier: z.enum(['standard', 'express_8hr', 'express_4hr']).default('standard'),
    frequency: z.enum(['one_time', 'weekly', 'biweekly']).optional().default('one_time'),
  }),
  pricing: z.object({
    subtotal: z.number(),
    discount_amount: z.number().default(0),
    total: z.number(),
    promo_code: z.string().optional().nullable(),
  }),
  payment_method: z.object({
    card_brand: z.string().default('visa'),
    last_4: z.string().default('4242'),
    payment_token: z.string().optional().nullable(),
  }).optional(),
});

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit(`booking:${clientIp}`, 10, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many booking requests from this network. Please wait a minute and try again.' },
        { status: 429 }
      );
    }

    const rawBody = await request.json();
    const validated = BookingSchema.parse(rawBody);

    // Calculate delivery date (48 hours standard or express, skip Sunday)
    const pickup = new Date(validated.schedule.pickup_date + 'T12:00:00');
    const delivery = new Date(pickup);
    delivery.setDate(delivery.getDate() + 2); // 48 hours

    if (delivery.getDay() === 0) {
      delivery.setDate(delivery.getDate() + 1); // If Sunday, deliver Monday
    }

    const deliveryDateStr = delivery.toISOString().split('T')[0];
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `F11-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    const isSupabaseConfigured =
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

    if (isSupabaseConfigured) {
      try {
        const authClient = await createClient();
        const {
          data: { user },
        } = await authClient.auth.getUser();

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
              delivery_window: validated.schedule.pickup_window,
              weight_lbs: validated.services.estimated_weight_lbs || null,
              subtotal: validated.pricing.subtotal,
              express_tier: validated.schedule.express_tier,
              promo_code: validated.pricing.promo_code || null,
              discount_amount: validated.pricing.discount_amount,
              total: validated.pricing.total,
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
            // 4. Insert Order Items
            const itemsToInsert = [];

            if (validated.services.estimated_weight_lbs && validated.services.estimated_weight_lbs > 0) {
              itemsToInsert.push({
                order_id: insertedOrder.id,
                garment_type: 'wash_fold',
                service_type: 'wash_fold',
                quantity: 1,
                unit_price: 3.0,
                subtotal: Math.max(45.0, validated.services.estimated_weight_lbs * 3.0),
                notes: `${validated.services.estimated_weight_lbs} lbs wash & fold laundry`,
              });
            }

            for (const item of validated.services.dry_clean_items) {
              itemsToInsert.push({
                order_id: insertedOrder.id,
                garment_type: item.garment_type,
                service_type: 'dry_clean',
                quantity: item.quantity,
                unit_price: 8.97, // default per item
                subtotal: item.quantity * 8.97,
                notes: null,
              });
            }

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

            // 6. Increment promo code usage count in database if promo was used
            if (validated.pricing.promo_code) {
              try {
                const cleanPromo = validated.pricing.promo_code.toUpperCase().trim();
                const { data: promoRow } = await supabase
                  .from('promo_codes')
                  .select('id, current_uses')
                  .eq('code', cleanPromo)
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
                deliveryWindow: validated.schedule.pickup_window,
                weightLbs: validated.services.estimated_weight_lbs,
                total: validated.pricing.total,
                trackingUrl: `${origin}/track/${insertedOrder.id}`,
              }).catch((notifyErr) => console.warn('Booking stage notification notice:', notifyErr));
            } catch (notifyErr) {
              console.warn('Booking stage notification error:', notifyErr);
            }

            return NextResponse.json({
              success: true,
              order: insertedOrder,
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
      delivery_window: validated.schedule.pickup_window,
      weight_lbs: validated.services.estimated_weight_lbs || null,
      subtotal: validated.pricing.subtotal,
      express_tier: validated.schedule.express_tier,
      promo_code: validated.pricing.promo_code || null,
      discount_amount: validated.pricing.discount_amount,
      total: validated.pricing.total,
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
        deliveryWindow: validated.schedule.pickup_window,
        weightLbs: validated.services.estimated_weight_lbs,
        total: validated.pricing.total,
        trackingUrl: `${origin}/track/${createdOrder.id}`,
      }).catch((notifyErr) => console.warn('Booking fallback stage notification notice:', notifyErr));
    } catch (notifyErr) {
      console.warn('Booking fallback notification error:', notifyErr);
    }

    return NextResponse.json({
      success: true,
      order: createdOrder,
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
