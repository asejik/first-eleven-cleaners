'use client';

import { useState, useEffect, useRef } from 'react';
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
import { earliestPickupDate } from '@/lib/schedule';
import { promoFinancialInputs, type AppliedPromo } from '@/lib/promo';

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

// Earliest pickup dates come from the same Dallas-time rules the server enforces (PR-12)
export function getMinPickupDate(tier: 'standard' | 'express_24hr' = 'standard') {
  return earliestPickupDate(tier);
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
  const [smsConsent, setSmsConsent] = useState<boolean>(Boolean(user?.sms_consent) || false);
  const [smsPromotionsConsent, setSmsPromotionsConsent] = useState<boolean>(Boolean(user?.sms_promotions_consent) || false);
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
    // Express is a morning pickup only (PR-12)
    if (tier === 'express_24hr') setPickupWindow('morning');
    const minDate = getMinPickupDate(tier);
    if (pickupDate < minDate) {
      setPickupDate(minDate);
    }
  };

  // Step 4: Promo & Payment
  const [promoCodeInput, setPromoCodeInput] = useState(PROMO_CODE_LAUNCH);
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>({
    code: PROMO_CODE_LAUNCH,
    discount_type: 'percentage',
    discount_value: 15,
  });
  // Why a pre-applied code was removed (e.g. a first-order code already used), shown on Review
  const [promoNotice, setPromoNotice] = useState<string | null>(null);

  // Step 5: Card Simulator
  const [cardNumber, setCardNumber] = useState('•••• •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('•••');

  // Step 6: Confirmation result
  const [confirmedOrder, setConfirmedOrder] = useState<{ order_number: string; id: string } | null>(null);
  // One key per checkout: resubmitting (double click, retry after a timeout) returns the
  // order already created instead of booking twice (PR-11)
  const checkoutKeyRef = useRef<string | null>(null);

  // TanStack Query Hooks
  const { data: slotData } = useAvailableSlots(pickupDate);
  const validatePromoMutation = useValidatePromoCode();
  const validatePromo = validatePromoMutation.mutateAsync;
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
          if (d.smsConsent !== undefined) setSmsConsent(Boolean(d.smsConsent));
          if (d.smsPromotionsConsent !== undefined) setSmsPromotionsConsent(Boolean(d.smsPromotionsConsent));
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
          smsConsent,
          smsPromotionsConsent,
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
    smsConsent,
    smsPromotionsConsent,
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

  // Fixed-dollar codes are dollars off, as the server applies them (SEC-15, P05 AR-02)
  const { discountPercent, discountAmount: promoDiscountAmount } = promoFinancialInputs(appliedPromo);

  const financials = calculateOrderFinancials({
    subtotal,
    isExpress: isExpressActive,
    discountPercent,
    discountAmount: promoDiscountAmount,
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
    setPromoNotice(null);
    try {
      const result = await validatePromoMutation.mutateAsync({ code: promoCodeInput.trim(), email });
      setAppliedPromo({ code: result.code, discount_type: result.discount_type, discount_value: result.discount_value });
      addToast({ type: 'success', title: 'Promo Applied!', message: result.message });
    } catch (err: unknown) {
      setAppliedPromo(null);
      addToast({ type: 'error', title: 'Invalid Code', message: (err as Error).message });
    }
  };

  // On reaching Review, re-check the applied code against this customer, so a code they
  // have already used (e.g. first-order KICKOFF15) is removed before the card step instead
  // of failing at Confirm (P05 AR-02)
  const recheckPromoRef = useRef<string | null>(null);
  useEffect(() => {
    if (step !== 4 || !appliedPromo || !email) return;
    const key = `${appliedPromo.code}|${email.trim().toLowerCase()}`;
    if (recheckPromoRef.current === key) return;
    recheckPromoRef.current = key;
    const recheckPromo = async () => {
      try {
        await validatePromo({ code: appliedPromo.code, email });
      } catch (err: unknown) {
        setAppliedPromo(null);
        setPromoCodeInput('');
        setPromoNotice((err as Error).message);
      }
    };
    recheckPromo();
  }, [step, appliedPromo, email, validatePromo]);

  // Handle Final Booking Submission
  const handleCompleteBooking = async (
    paymentToken?: string,
    cardBrand: string = 'visa',
    last4: string = cardNumber ? cardNumber.slice(-4) : '4242'
  ) => {
    try {
      if (!checkoutKeyRef.current && typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        checkoutKeyRef.current = crypto.randomUUID();
      }
      const payload = {
        idempotency_key: checkoutKeyRef.current ?? undefined,
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
        consents: {
          sms_order_updates: smsConsent,
          sms_promotions: smsPromotionsConsent,
        },
      };

      const result = await submitBookingMutation.mutateAsync(payload);
      setConfirmedOrder({ order_number: result.order_number, id: result.order.id });
      checkoutKeyRef.current = null; // the next booking is a new checkout
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
    smsConsent,
    setSmsConsent,
    smsPromotionsConsent,
    setSmsPromotionsConsent,
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
    promoNotice,
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
