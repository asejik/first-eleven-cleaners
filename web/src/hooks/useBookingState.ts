'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  catalogSubtotal,
  catalogLineTotal,
  WASH_FOLD_PRICE_PER_LB,
  WASH_FOLD_MINIMUM_PRICE,
  PROMO_CODE_LAUNCH,
  calculateOrderFinancials,
  isExpressExcluded,
  orderMinimumGap,
  memberZoneMinimum,
  MEMBER_PROMO_NOT_COMBINED,
  type ZoneConfig,
} from '@/lib/constants';
import {
  zoneDeliveryDate,
  isRoutineFrequency,
  nextZoneRouteDay,
  DEFAULT_COVERAGE,
  type Coverage,
} from '@/lib/coverage';
import { useCoverage, useAddressCoverage } from '@/hooks/useCoverage';
import { addDaysToDate } from '@/lib/texas-time';
import { useUIStore } from '@/stores/ui-store';
import { useAuth } from '@/hooks/useAuth';
import { useAvailableSlots, useValidatePromoCode, useSubmitBooking } from '@/hooks/useBooking';
import { earliestPickupDate, isExpressPickupDay } from '@/lib/schedule';
import { promoFinancialInputs, type AppliedPromo } from '@/lib/promo';
import { holdAmountFor, shouldPlaceHoldNow } from '@/lib/payment-hold';
import {
  newAlterationDraft,
  draftToLine,
  checkAlterationLine,
  buttonsOnlyError,
  type AlterationDraft,
} from '@/lib/alterations';

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

// Estimated delivery date: the same rule the server stores. The plant runs Mon-Fri; Zones 3
// and 4 deliver on their next route day (client 2026-10-07, 8B).
export function getEstimatedDeliveryDate(
  pickupDateStr: string,
  tier: 'standard' | 'express_24hr' = 'standard',
  hasAlterations = false,
  zone: ZoneConfig | null = null,
  coverage: Coverage = DEFAULT_COVERAGE
) {
  if (!pickupDateStr) return '';
  // An order with alterations returns together on the alteration date (Parts B-D)
  return formatDisplayDate(zoneDeliveryDate(zone, pickupDateStr, tier, { alterations: hasAlterations }, coverage));
}

/** Zones with set route days pick from a list: Zone 3/4 route days, Zone 5 run dates (client 8B-8C). */
function routeDateOptions(zone: ZoneConfig | null, coverage: Coverage, zone5Runs: string[] | null): string[] | null {
  if (!zone) return null;
  if (zone.id === 'zone_5') return zone5Runs;
  if (zone.routeDays.length >= 6) return null;
  const dates: string[] = [];
  let date = nextZoneRouteDay(zone, earliestPickupDate('standard'), coverage);
  while (dates.length < 8) {
    dates.push(date);
    date = nextZoneRouteDay(zone, addDaysToDate(date, 1), coverage);
  }
  return dates;
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
  // Required checkout acceptance of the hold-and-charge terms (Part A)
  const [paymentTermsAccepted, setPaymentTermsAccepted] = useState(false);
  const [street, setStreet] = useState('');
  const [unit, setUnit] = useState('');
  const [city, setCity] = useState('Dallas');
  const [zip, setZip] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  // The zone comes from the ZIP lists, or the driving distance for anything else (client 8A)
  const coverage = useCoverage();
  const addressCoverage = useAddressCoverage({ street, city, zip }, coverage);
  const detectedZone: ZoneConfig | null = addressCoverage.resolution.status === 'served' ? addressCoverage.resolution.zone : null;
  const isWaitlist = addressCoverage.resolution.status === 'waitlist';

  // Prefill contact details when the signed-in customer loads. The login now arrives after
  // the first render (P05 AR-05), so the initial values above are empty. Adjusted during
  // render when the customer changes; never overwrites anything already typed.
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (user && prefilledFor !== user.id) {
    setPrefilledFor(user.id);
    if (!fullName) setFullName(user.full_name || '');
    if (!email) setEmail(user.email || '');
    if (!phone) setPhone(user.phone || '');
    if (user.sms_consent) setSmsConsent(true);
    if (user.sms_promotions_consent) setSmsPromotionsConsent(true);
  }

  // Step 2: Services
  const [serviceType, setServiceType] = useState<'dry_clean' | 'wash_fold' | 'mixed'>('mixed');
  const [washFoldWeight, setWashFoldWeight] = useState<number>(15);
  const [dryCleanQuantities, setDryCleanQuantities] = useState<Record<string, number>>({});
  // Alterations: one line per piece with its fit instruction (Parts B-D)
  const [alterationLines, setAlterationLines] = useState<AlterationDraft[]>([]);
  const addAlteration = (garmentType: string) => setAlterationLines((prev) => [...prev, newAlterationDraft(garmentType)]);
  const updateAlteration = (uid: string, patch: Partial<AlterationDraft>) =>
    setAlterationLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  const removeAlteration = (uid: string) => setAlterationLines((prev) => prev.filter((l) => l.uid !== uid));

  // Step 3: Schedule
  const [expressTier, setExpressTier] = useState<'standard' | 'express_24hr'>('standard');
  const [pickupDate, setPickupDate] = useState<string>(getMinPickupDate('standard'));
  const [pickupWindow, setPickupWindow] = useState<'morning' | 'evening'>('morning');
  const [frequency, setFrequency] = useState<'one_time' | 'weekly' | 'biweekly'>('one_time');
  // Weekly or Bi-Weekly joins the Routine: the auto-renewal agreement (client 2026-10-08)
  const [routineTermsAccepted, setRoutineTermsAccepted] = useState(false);
  // Already a member (signed in): this booking is an extra one-time pickup
  const { data: routineStatus } = useQuery({
    queryKey: ['routine-membership'],
    queryFn: async (): Promise<{ membership: { cadence: 'weekly' | 'biweekly' } | null }> => {
      const res = await fetch('/api/routine');
      if (!res.ok) return { membership: null };
      return res.json();
    },
    enabled: Boolean(user && (!user.role || user.role === 'customer')),
    staleTime: 60 * 1000,
  });
  const isRoutineMember = Boolean(routineStatus?.membership);
  // Member pricing (client 2026-10-08): a member's every booking is priced at their plan
  const planFrequency: 'one_time' | 'weekly' | 'biweekly' = routineStatus?.membership?.cadence ?? frequency;

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
  // A friend's referral link (/r/CODE -> /book?ref=CODE, client 2026-10-10): their code is
  // applied in place of the launch code, and checked against this customer on Review
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    const code = ref ? ref.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) : '';
    if (!code) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the URL after hydration
    setPromoCodeInput(code);
    setAppliedPromo({ code, discount_type: 'referral', discount_value: 15 });
  }, []);

  // Step 5: Card Simulator
  const [cardNumber, setCardNumber] = useState('•••• •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('•••');

  // Step 6: Confirmation result
  const [confirmedOrder, setConfirmedOrder] = useState<{
    order_number: string;
    id: string;
    deliveryDate?: string | null;
    /** Zone 5: where this run stands with this booking included */
    routeThreshold?: { booked: number; threshold: number } | null;
    /** Joined the Routine with this booking (client 2026-10-08) */
    routine?: { cadence: 'weekly' | 'biweekly'; next_pickup_date: string } | null;
  } | null>(null);
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
          if (d.zip) setZip(d.zip);
          if (d.deliveryNotes) setDeliveryNotes(d.deliveryNotes);
          if (d.serviceType) setServiceType(d.serviceType);
          if (d.washFoldWeight) setWashFoldWeight(d.washFoldWeight);
          if (d.dryCleanQuantities) setDryCleanQuantities(d.dryCleanQuantities);
          if (Array.isArray(d.alterationLines)) setAlterationLines(d.alterationLines);
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
          // Photos are too large for session storage; the rest of each line is kept
          alterationLines: alterationLines.map((line) => ({ ...line, photo: undefined })),
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
    alterationLines,
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
      ? catalogSubtotal(dryCleanQuantities)
      : 0;

  const activeAlterations = serviceType !== 'wash_fold' ? alterationLines : [];
  const hasAlterations = activeAlterations.length > 0;
  const calculatedAlterations = activeAlterations.reduce((acc, l) => acc + catalogLineTotal(l.garment_type, l.quantity), 0);
  const subtotal = calculatedWashFold + calculatedDryClean + calculatedAlterations;
  // Every alteration needs a valid fit instruction; buttons alone can't be booked
  const alterationsReady = activeAlterations.every((l) => checkAlterationLine(draftToLine(l)).ok);
  const buttonsOnlyMessage = buttonsOnlyError({
    itemKeys: [
      ...(serviceType !== 'wash_fold' ? Object.keys(dryCleanQuantities).filter((k) => (dryCleanQuantities[k] || 0) > 0) : []),
      ...activeAlterations.map((l) => l.garment_type),
    ],
    hasLaundry: serviceType !== 'dry_clean' && washFoldWeight > 0,
  });

  // Excluded Garments & Capacity for 24-Hour Express
  const hasExcludedGarments =
    hasAlterations ||
    (serviceType !== 'wash_fold' &&
      Object.keys(dryCleanQuantities).some((key) => isExpressExcluded(key) && (dryCleanQuantities[key] || 0) > 0));

  // Express pickups run Monday to Thursday (client 2026-10-06)
  const isExpressDay = Boolean(pickupDate) && isExpressPickupDay(pickupDate);
  const isExpressCapacityFull = slotData?.express_available === false;
  const isExpressEligible =
    Boolean(detectedZone?.expressEligible) &&
    !hasExcludedGarments &&
    pickupWindow === 'morning' &&
    isExpressDay &&
    !isExpressCapacityFull;
  const isExpressActive = expressTier === 'express_24hr' && isExpressEligible;
  const effectiveExpressTier: 'standard' | 'express_24hr' = isExpressActive ? 'express_24hr' : 'standard';

  // Fixed-dollar codes are dollars off, as the server applies them (SEC-15, P05 AR-02)
  // Promo codes don't combine with member pricing: the code is set aside while it applies. A
  // friend's referral code is money, not a promo, so it stays (client 2026-10-10)
  const effectivePromo = planFrequency === 'one_time' || appliedPromo?.discount_type === 'referral' ? appliedPromo : null;
  const { discountPercent, discountAmount: promoDiscountAmount } = promoFinancialInputs(effectivePromo);

  // Zone 5: the Extended Reach fee line, half off for Routine members (client 8C)
  const extendedReach = detectedZone?.id === 'zone_5' ? addressCoverage.extendedReach : null;
  const isRoutine = isRoutineFrequency(planFrequency);
  const extendedReachFee = extendedReach ? (isRoutine ? extendedReach.routineFee : extendedReach.fullFee) : 0;
  // "Join the Routine": Bi-Weekly matches the Zone 5 route
  const joinRoutine = () => setFrequency('biweekly');

  const financials = calculateOrderFinancials({
    subtotal,
    isExpress: isExpressActive,
    discountPercent,
    discountAmount: promoDiscountAmount,
    frequency: planFrequency,
    extendedReachFee,
    alterationSubtotal: calculatedAlterations,
  });

  // Route-day zones pick from their dates; keep the pickup on one of them (adjusted during
  // render, like the sign-in prefill above)
  const routeDates = routeDateOptions(detectedZone, coverage, extendedReach ? extendedReach.runs.map((r) => r.date) : null);
  if (routeDates && routeDates.length > 0 && !routeDates.includes(pickupDate) && expressTier === 'standard') {
    setPickupDate(routeDates[0]);
  }
  const getDeliveryDate = (pickupDateStr: string, tier: 'standard' | 'express_24hr' = 'standard', alterations = false) =>
    getEstimatedDeliveryDate(pickupDateStr, tier, alterations, detectedZone, coverage);

  const expressSurcharge = financials.expressSurcharge;
  const discountAmount = financials.discountAmount;
  const total = financials.finalTotal;
  const zoneMinimumGap = orderMinimumGap(subtotal, detectedZone, planFrequency, calculatedAlterations);
  // Card hold shown at checkout; the server computes the real one from its own prices (Part A)
  const holdAmount = holdAmountFor(total, detectedZone ? memberZoneMinimum(detectedZone, planFrequency) : 0);
  const holdNow = Boolean(pickupDate) && shouldPlaceHoldNow(pickupDate);

  // Step Validations: Step 1 requires full address (including city) AND a valid recognized service zone
  const isStep1Valid = Boolean(fullName && email && phone && street && city && zip && detectedZone !== null && !addressCoverage.checking);
  const isStep2Valid =
    ((serviceType !== 'dry_clean' && washFoldWeight > 0) ||
      (serviceType !== 'wash_fold' && Object.values(dryCleanQuantities).some((q) => q > 0)) ||
      hasAlterations) &&
    alterationsReady &&
    !buttonsOnlyMessage;
  const isStep3Valid = Boolean(
    pickupDate && pickupWindow && (!routeDates || routeDates.includes(pickupDate)) && (frequency === 'one_time' || routineTermsAccepted)
  );

  // Handle Promo Validation
  const handleApplyPromo = async () => {
    if (!promoCodeInput.trim()) return;
    setPromoNotice(null);
    // (A member's code is checked by the server: only a friend's referral code applies)
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
          alteration_items: activeAlterations.map(draftToLine),
        },
        schedule: {
          pickup_date: pickupDate,
          pickup_window: pickupWindow,
          express_tier: effectiveExpressTier,
          // A member's extra pickup is one-time; joining needs the agreement
          frequency: isRoutineMember ? 'one_time' : frequency,
        },
        pricing: {
          subtotal,
          discount_amount: discountAmount,
          total,
          promo_code: effectivePromo?.code || null,
        },
        payment_method: {
          card_brand: cardBrand,
          last_4: last4,
          payment_token: paymentToken || null,
        },
        consents: {
          sms_order_updates: smsConsent,
          sms_promotions: smsPromotionsConsent,
          payment_terms: paymentTermsAccepted,
          routine_terms: frequency !== 'one_time' && routineTermsAccepted,
        },
      };

      const result = await submitBookingMutation.mutateAsync(payload);
      setConfirmedOrder({
        order_number: result.order_number,
        id: result.order.id,
        deliveryDate: result.order.delivery_date ?? null,
        routeThreshold: result.route_threshold ?? null,
        routine: result.routine ?? null,
      });
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
    coverage,
    addressCoverage,
    isWaitlist,
    extendedReach,
    extendedReachFee,
    isRoutine,
    joinRoutine,
    routeDates,
    getDeliveryDate,
    serviceType,
    setServiceType,
    washFoldWeight,
    setWashFoldWeight,
    dryCleanQuantities,
    updateDryCleanQty,
    alterationLines: activeAlterations,
    addAlteration,
    updateAlteration,
    removeAlteration,
    hasAlterations,
    buttonsOnlyMessage,
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
    appliedPromo: effectivePromo,
    handleApplyPromo,
    // Set aside while member pricing applies (client 2026-10-08)
    promoNotice: planFrequency !== 'one_time' && appliedPromo && !effectivePromo ? MEMBER_PROMO_NOT_COMBINED : promoNotice,
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
    holdAmount,
    holdNow,
    paymentTermsAccepted,
    setPaymentTermsAccepted,
    isStep1Valid,
    isStep2Valid,
    isStep3Valid,
    routineTermsAccepted,
    setRoutineTermsAccepted,
    isRoutineMember,
    handleCompleteBooking,
  };
}
