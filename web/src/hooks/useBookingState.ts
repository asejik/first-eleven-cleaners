'use client';

import { useState, useEffect } from 'react';
import {
  DRY_CLEAN_PRICES,
  WASH_FOLD_PRICE_PER_LB,
  WASH_FOLD_MINIMUM_PRICE,
  PROMO_CODE_LAUNCH,
  calculateOrderFinancials,
  EXPRESS_EXCLUDED_GARMENTS,
  resolveZoneByZip,
  getZoneMinimumGap,
  type ZoneConfig,
} from '@/lib/constants';
import { useUIStore } from '@/stores/ui-store';
import { useAuth } from '@/hooks/useAuth';
import { useAvailableSlots, useValidatePromoCode, useSubmitBooking } from '@/hooks/useBooking';

// Helper to format local date to YYYY-MM-DD (avoiding UTC timezone shift)
export function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to format display date (e.g. Wednesday, Sep 2, 2026)
export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Calculates earliest allowable Express pickup date based on cutoffs:
 * - Orders placed by 7:00 AM can take THIS morning's Express pickup (Mon–Fri).
 * - Orders placed between 7:00 AM and 9:00 PM: next available is tomorrow morning (skipping weekends).
 * - Orders placed after 9:00 PM: tomorrow morning is closed; earliest is day-after-tomorrow.
 * - Saturday Express is not offered; Sunday is closed.
 */
export function getNextExpressPickupDate(now: Date = new Date()): string {
  const d = new Date(now);
  const hour = d.getHours();
  const dayOfWeek = d.getDay(); // 0: Sun, 1: Mon, ..., 5: Fri, 6: Sat

  let addDays = 1;
  if (hour < 7 && dayOfWeek >= 1 && dayOfWeek <= 5) {
    addDays = 0; // Same-day morning pickup
  } else if (hour >= 21) {
    addDays = 2; // Past 9:00 PM cutoff for tomorrow
  } else {
    addDays = 1; // Between 7:00 AM and 9:00 PM -> tomorrow morning
  }

  d.setDate(d.getDate() + addDays);

  // Express is Monday through Friday pickups only
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }

  return formatLocalDate(d);
}

// Helper to calculate earliest allowable pickup date based on turnaround tier
export function getMinPickupDate(tier: 'standard' | 'express_24hr' = 'standard') {
  if (tier === 'express_24hr') {
    return getNextExpressPickupDate();
  }
  const d = new Date();
  d.setDate(d.getDate() + 2); // 48-hour minimum advance schedule for standard
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // Skip Sunday (plant closed)
  return formatLocalDate(d);
}

// Helper to calculate estimated delivery date based on pickup date and tier
export function getEstimatedDeliveryDate(pickupDateStr: string, tier: 'standard' | 'express_24hr' = 'standard') {
  if (!pickupDateStr) return '';
  const [y, m, d] = pickupDateStr.split('-').map(Number);
  const delivery = new Date(y, m - 1, d);
  if (tier === 'express_24hr') {
    delivery.setDate(delivery.getDate() + 1); // 24 hours: next morning
  } else {
    delivery.setDate(delivery.getDate() + 2); // 48 hours: standard turnaround
  }
  if (delivery.getDay() === 0) {
    delivery.setDate(delivery.getDate() + 1); // Skip Sunday delivery to Monday
  }
  return formatDisplayDate(formatLocalDate(delivery));
}

export function useBookingState() {
  const { user } = useAuth();
  const addToast = useUIStore((s) => s.addToast);

  // Flow State (1 to 6)
  const [step, setStep] = useState<number>(1);

  // Step 1: Customer & Address
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [street, setStreet] = useState('');
  const [unit, setUnit] = useState('');
  const [city, setCity] = useState('Dallas');
  const [zip, setZip] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [detectedZone, setDetectedZone] = useState<ZoneConfig | null>(() => resolveZoneByZip(''));

  // Step 2: Services
  const [serviceType, setServiceType] = useState<'dry_clean' | 'wash_fold' | 'mixed'>('mixed');
  const [washFoldWeight, setWashFoldWeight] = useState<number>(15);
  const [dryCleanQuantities, setDryCleanQuantities] = useState<Record<string, number>>({});

  // Step 3: Schedule
  const [expressTier, setExpressTier] = useState<'standard' | 'express_24hr'>('standard');
  const [pickupDate, setPickupDate] = useState<string>(getMinPickupDate('standard'));
  const [pickupWindow, setPickupWindow] = useState<'morning' | 'evening'>('morning');
  const [frequency, setFrequency] = useState<'one_time' | 'weekly' | 'biweekly'>('one_time');

  const handleSelectTier = (tier: 'standard' | 'express_24hr') => {
    setExpressTier(tier);
    const minDate = getMinPickupDate(tier);
    if (pickupDate < minDate) {
      setPickupDate(minDate);
    }
  };

  // Step 4: Promo & Payment
  const [promoCodeInput, setPromoCodeInput] = useState(PROMO_CODE_LAUNCH);
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount_value: number } | null>({
    code: PROMO_CODE_LAUNCH,
    discount_value: 15,
  });

  // Step 5: Card Simulator
  const [cardNumber, setCardNumber] = useState('•••• •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('•••');

  // Step 6: Confirmation result
  const [confirmedOrder, setConfirmedOrder] = useState<{ order_number: string; id: string } | null>(null);

  // TanStack Query Hooks
  const { data: slotData } = useAvailableSlots(pickupDate);
  const validatePromoMutation = useValidatePromoCode();
  const submitBookingMutation = useSubmitBooking();

  // Load draft from sessionStorage on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = sessionStorage.getItem('f11_booking_draft');
        if (saved) {
          const d = JSON.parse(saved);
          if (d.fullName && !user?.full_name) setFullName(d.fullName);
          if (d.email && !user?.email) setEmail(d.email);
          if (d.phone && !user?.phone) setPhone(d.phone);
          if (d.street) setStreet(d.street);
          if (d.unit) setUnit(d.unit);
          if (d.city) setCity(d.city);
          if (d.zip) {
            setZip(d.zip);
            setDetectedZone(resolveZoneByZip(d.zip));
          }
          if (d.deliveryNotes) setDeliveryNotes(d.deliveryNotes);
          if (d.serviceType) setServiceType(d.serviceType);
          if (d.washFoldWeight) setWashFoldWeight(d.washFoldWeight);
          if (d.dryCleanQuantities) setDryCleanQuantities(d.dryCleanQuantities);
          if (d.expressTier) setExpressTier(d.expressTier);
          if (d.pickupDate) setPickupDate(d.pickupDate);
          if (d.pickupWindow) setPickupWindow(d.pickupWindow);
          if (d.frequency) setFrequency(d.frequency);
          if (d.step && d.step > 1 && d.step < 6) setStep(d.step);
        }
      } catch {
        // ignore storage errors
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [user]);

  // Persist draft to sessionStorage on state updates
  useEffect(() => {
    if (step === 6) return;
    try {
      sessionStorage.setItem(
        'f11_booking_draft',
        JSON.stringify({
          fullName,
          email,
          phone,
          street,
          unit,
          city,
          zip,
          deliveryNotes,
          serviceType,
          washFoldWeight,
          dryCleanQuantities,
          expressTier,
          pickupDate,
          pickupWindow,
          frequency,
          step,
        })
      );
    } catch {
      // ignore storage errors
    }
  }, [
    fullName,
    email,
    phone,
    street,
    unit,
    city,
    zip,
    deliveryNotes,
    serviceType,
    washFoldWeight,
    dryCleanQuantities,
    expressTier,
    pickupDate,
    pickupWindow,
    frequency,
    step,
  ]);

  // Dry clean helper
  const updateDryCleanQty = (key: string, delta: number) => {
    setDryCleanQuantities((prev) => {
      const current = prev[key] || 0;
      const updated = Math.max(0, current + delta);
      if (updated === 0) {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }
      return { ...prev, [key]: updated };
    });
  };

  // Financial calculations
  const calculatedWashFold =
    serviceType !== 'dry_clean'
      ? washFoldWeight < 15
        ? WASH_FOLD_MINIMUM_PRICE
        : washFoldWeight * WASH_FOLD_PRICE_PER_LB
      : 0;

  const calculatedDryClean =
    serviceType !== 'wash_fold'
      ? Object.entries(dryCleanQuantities).reduce((acc, [key, qty]) => {
          const item = DRY_CLEAN_PRICES[key];
          return acc + (item ? item.price * qty : 0);
        }, 0)
      : 0;

  const subtotal = calculatedWashFold + calculatedDryClean;

  // Excluded Garments & Capacity for 24-Hour Express
  const hasExcludedGarments = Array.isArray(EXPRESS_EXCLUDED_GARMENTS)
    ? Object.keys(dryCleanQuantities).some(
        (key) => (EXPRESS_EXCLUDED_GARMENTS as readonly string[]).includes(key) && (dryCleanQuantities[key] || 0) > 0
      )
    : false;

  const [py, pm, pd] = pickupDate ? pickupDate.split('-').map(Number) : [0, 0, 0];
  const selectedDay = new Date(py, pm - 1, pd).getDay();
  const isPickupMonFri = selectedDay >= 1 && selectedDay <= 5;
  const isExpressCapacityFull = slotData?.express_available === false;
  const isExpressEligible =
    Boolean(detectedZone?.expressEligible) &&
    !hasExcludedGarments &&
    pickupWindow === 'morning' &&
    isPickupMonFri &&
    !isExpressCapacityFull;
  const isExpressActive = expressTier === 'express_24hr' && isExpressEligible;
  const effectiveExpressTier: 'standard' | 'express_24hr' = isExpressActive ? 'express_24hr' : 'standard';

  const discountPercent = appliedPromo?.discount_value || 0;

  const financials = calculateOrderFinancials({
    subtotal,
    isExpress: isExpressActive,
    discountPercent,
    frequency,
  });

  const expressSurcharge = financials.expressSurcharge;
  const discountAmount = financials.discountAmount;
  const total = financials.finalTotal;
  const zoneMinimumGap = getZoneMinimumGap(subtotal, detectedZone);

  // Step Validations: Step 1 requires full address (including city) AND a valid recognized service zone
  const isStep1Valid = Boolean(fullName && email && phone && street && city && zip && detectedZone !== null);
  const isStep2Valid =
    (serviceType !== 'dry_clean' && washFoldWeight > 0) ||
    (serviceType !== 'wash_fold' && Object.values(dryCleanQuantities).some((q) => q > 0));
  const isStep3Valid = Boolean(pickupDate && pickupWindow);

  // Handle Promo Validation
  const handleApplyPromo = async () => {
    if (!promoCodeInput.trim()) return;
    try {
      const result = await validatePromoMutation.mutateAsync(promoCodeInput.trim());
      setAppliedPromo({ code: result.code, discount_value: result.discount_value });
      addToast({ type: 'success', title: 'Promo Applied!', message: result.message });
    } catch (err: unknown) {
      setAppliedPromo(null);
      addToast({ type: 'error', title: 'Invalid Code', message: (err as Error).message });
    }
  };

  // Handle Final Booking Submission
  const handleCompleteBooking = async (
    paymentToken?: string,
    cardBrand: string = 'visa',
    last4: string = cardNumber ? cardNumber.slice(-4) : '4242'
  ) => {
    try {
      const payload = {
        customer: { full_name: fullName, email, phone },
        address: { street, unit, city, state: 'TX', zip, delivery_notes: deliveryNotes },
        services: {
          type: serviceType,
          dry_clean_items: Object.entries(dryCleanQuantities).map(([garment_type, quantity]) => ({
            garment_type,
            quantity,
          })),
          estimated_weight_lbs: serviceType !== 'dry_clean' ? washFoldWeight : 0,
        },
        schedule: {
          pickup_date: pickupDate,
          pickup_window: pickupWindow,
          express_tier: effectiveExpressTier,
          frequency,
        },
        pricing: {
          subtotal,
          discount_amount: discountAmount,
          total,
          promo_code: appliedPromo?.code || null,
        },
        payment_method: {
          card_brand: cardBrand,
          last_4: last4,
          payment_token: paymentToken || null,
        },
      };

      const result = await submitBookingMutation.mutateAsync(payload);
      setConfirmedOrder({ order_number: result.order_number, id: result.order.id });
      try {
        sessionStorage.removeItem('f11_booking_draft');
      } catch {
        // ignore
      }
      setStep(6);
      addToast({
        type: 'success',
        title: 'Booking Confirmed!',
        message: 'Order created with 48-hour Match-Ready guarantee.',
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Booking Error',
        message: (err as Error).message || 'Failed to complete order. Please try again.',
      });
    }
  };

  return {
    user,
    addToast,
    step,
    setStep,
    fullName,
    setFullName,
    email,
    setEmail,
    phone,
    setPhone,
    street,
    setStreet,
    unit,
    setUnit,
    city,
    setCity,
    zip,
    setZip,
    deliveryNotes,
    setDeliveryNotes,
    detectedZone,
    setDetectedZone,
    serviceType,
    setServiceType,
    washFoldWeight,
    setWashFoldWeight,
    dryCleanQuantities,
    updateDryCleanQty,
    expressTier: effectiveExpressTier,
    handleSelectTier,
    pickupDate,
    setPickupDate,
    pickupWindow,
    setPickupWindow,
    frequency,
    setFrequency,
    promoCodeInput,
    setPromoCodeInput,
    appliedPromo,
    handleApplyPromo,
    cardNumber,
    setCardNumber,
    cardExpiry,
    setCardExpiry,
    cardCvc,
    setCardCvc,
    confirmedOrder,
    slotData,
    submitBookingMutation,
    calculatedWashFold,
    calculatedDryClean,
    subtotal,
    hasExcludedGarments,
    isExpressCapacityFull,
    isExpressEligible,
    isExpressActive,
    discountPercent,
    financials,
    expressSurcharge,
    discountAmount,
    total,
    zoneMinimumGap,
    isStep1Valid,
    isStep2Valid,
    isStep3Valid,
    handleCompleteBooking,
  };
}
