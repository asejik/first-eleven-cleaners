'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  DRY_CLEAN_PRICES,
  WASH_FOLD_PRICE_PER_LB,
  WASH_FOLD_MINIMUM_PRICE,
  PROMO_CODE_LAUNCH,
  ROUTES,
  calculateOrderFinancials,
} from '@/lib/constants';
import { useUIStore } from '@/stores/ui-store';
import { useAuth } from '@/hooks/useAuth';
import { useAvailableSlots, useValidatePromoCode, useSubmitBooking } from '@/hooks/useBooking';
import {
  BookingStepper,
  StepAddress,
  StepGarments,
  StepSchedule,
  StepReview,
  StepPayment,
  StepConfirmation,
} from '@/components/booking';
import styles from './page.module.css';

// Helper to format local date to YYYY-MM-DD (avoiding UTC timezone shift)
function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to format display date (e.g. Wednesday, Sep 2, 2026)
function formatDisplayDate(dateStr: string): string {
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

// Helper to calculate earliest allowable pickup date based on turnaround tier
function getMinPickupDate(tier: 'standard' | 'express_8hr' | 'express_4hr' = 'standard') {
  const d = new Date();
  if (tier === 'standard') {
    d.setDate(d.getDate() + 2); // 48-hour minimum advance schedule
  } else {
    d.setDate(d.getDate() + 1); // Express available starting next-day
  }
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // Skip Sunday (plant closed)
  return formatLocalDate(d);
}

// Helper to calculate estimated delivery date based on pickup date and tier
function getEstimatedDeliveryDate(pickupDateStr: string, tier: 'standard' | 'express_8hr' | 'express_4hr' = 'standard') {
  if (!pickupDateStr) return '';
  const [y, m, d] = pickupDateStr.split('-').map(Number);
  const delivery = new Date(y, m - 1, d);
  if (tier === 'standard') {
    delivery.setDate(delivery.getDate() + 2); // 48 hours standard turnaround
  } else {
    delivery.setDate(delivery.getDate() + 1); // Rush express
  }
  if (delivery.getDay() === 0) {
    delivery.setDate(delivery.getDate() + 1); // Skip Sunday delivery to Monday
  }
  return formatDisplayDate(formatLocalDate(delivery));
}

export default function BookingPage() {
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
  const [city] = useState('Dallas');
  const [zip, setZip] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Step 2: Services
  const [serviceType, setServiceType] = useState<'dry_clean' | 'wash_fold' | 'mixed'>('mixed');
  const [washFoldWeight, setWashFoldWeight] = useState<number>(15);
  const [dryCleanQuantities, setDryCleanQuantities] = useState<Record<string, number>>({});

  // Step 3: Schedule
  const [expressTier, setExpressTier] = useState<'standard' | 'express_8hr' | 'express_4hr'>('standard');
  const [pickupDate, setPickupDate] = useState<string>(getMinPickupDate('standard'));
  const [pickupWindow, setPickupWindow] = useState<'morning' | 'evening'>('morning');
  const [frequency, setFrequency] = useState<'one_time' | 'weekly' | 'biweekly'>('one_time');

  const handleSelectTier = (tier: 'standard' | 'express_8hr' | 'express_4hr') => {
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
    try {
      const saved = sessionStorage.getItem('f11_booking_draft');
      if (saved) {
        const d = JSON.parse(saved);
        if (d.fullName && !user?.full_name) setFullName(d.fullName);
        if (d.email && !user?.email) setEmail(d.email);
        if (d.phone && !user?.phone) setPhone(d.phone);
        if (d.street) setStreet(d.street);
        if (d.unit) setUnit(d.unit);
        if (d.zip) setZip(d.zip);
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
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: updated };
    });
  };

  // Math Calculations
  const calculatedWashFold =
    serviceType !== 'dry_clean' && washFoldWeight > 0
      ? Math.max(WASH_FOLD_MINIMUM_PRICE, washFoldWeight * WASH_FOLD_PRICE_PER_LB)
      : 0;

  const calculatedDryClean =
    serviceType !== 'wash_fold'
      ? Object.entries(dryCleanQuantities).reduce((acc, [k, q]) => acc + (DRY_CLEAN_PRICES[k]?.price || 0) * q, 0)
      : 0;

  const subtotal = calculatedWashFold + calculatedDryClean;
  const expressMultiplier =
    expressTier === 'express_8hr' ? 0.25 : expressTier === 'express_4hr' ? 0.4 : 0;
  const discountPercent = appliedPromo?.discount_value || 0;

  const financials = calculateOrderFinancials({
    subtotal,
    expressMultiplier,
    discountPercent,
  });

  const expressSurcharge = financials.expressSurcharge;
  const discountAmount = financials.discountAmount;
  const total = financials.finalTotal;

  // Step Validations
  const isStep1Valid = Boolean(fullName && email && phone && street && zip);
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
          express_tier: expressTier,
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

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Returning Customer Sign-In Prompt */}
        {!user && (
          <div
            style={{
              background: 'linear-gradient(135deg, #fef9ee 0%, #fef3c7 100%)',
              border: '1px solid #fde68a',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 18px',
              marginBottom: 'var(--space-6)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 'var(--text-sm)',
              color: '#78350f',
            }}
          >
            <span>
              👋 <strong>Already a customer?</strong> Sign in to prefill your information &amp; preferences.
            </span>
            <Link
              href={`${ROUTES.login}?redirect=${encodeURIComponent(ROUTES.book)}`}
              style={{
                color: 'var(--color-navy)',
                fontWeight: 'bold',
                textDecoration: 'underline',
                marginLeft: '12px',
                whiteSpace: 'nowrap',
              }}
            >
              Sign In &rarr;
            </Link>
          </div>
        )}

        <BookingStepper step={step} />

        {step === 1 && (
          <StepAddress
            fullName={fullName}
            setFullName={setFullName}
            email={email}
            setEmail={setEmail}
            phone={phone}
            setPhone={setPhone}
            street={street}
            setStreet={setStreet}
            unit={unit}
            setUnit={setUnit}
            zip={zip}
            setZip={setZip}
            deliveryNotes={deliveryNotes}
            setDeliveryNotes={setDeliveryNotes}
            isValid={isStep1Valid}
            onContinue={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <StepGarments
            serviceType={serviceType}
            setServiceType={setServiceType}
            washFoldWeight={washFoldWeight}
            setWashFoldWeight={setWashFoldWeight}
            dryCleanQuantities={dryCleanQuantities}
            updateDryCleanQty={updateDryCleanQty}
            isValid={isStep2Valid}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <StepSchedule
            expressTier={expressTier}
            handleSelectTier={handleSelectTier}
            pickupDate={pickupDate}
            setPickupDate={setPickupDate}
            pickupWindow={pickupWindow}
            setPickupWindow={setPickupWindow}
            frequency={frequency}
            setFrequency={setFrequency}
            slotData={slotData}
            getMinPickupDate={getMinPickupDate}
            formatDisplayDate={formatDisplayDate}
            formatLocalDate={formatLocalDate}
            getEstimatedDeliveryDate={getEstimatedDeliveryDate}
            onToast={addToast}
            isValid={isStep3Valid}
            onBack={() => setStep(2)}
            onContinue={() => setStep(4)}
          />
        )}

        {step === 4 && (
          <StepReview
            street={street}
            unit={unit}
            city={city}
            zip={zip}
            pickupDate={pickupDate}
            pickupWindow={pickupWindow}
            expressTier={expressTier}
            frequency={frequency}
            fullName={fullName}
            phone={phone}
            serviceType={serviceType}
            washFoldWeight={washFoldWeight}
            calculatedWashFold={calculatedWashFold}
            dryCleanQuantities={dryCleanQuantities}
            expressMultiplier={expressMultiplier}
            expressSurcharge={expressSurcharge}
            promoCodeInput={promoCodeInput}
            setPromoCodeInput={setPromoCodeInput}
            appliedPromo={appliedPromo}
            handleApplyPromo={handleApplyPromo}
            subtotal={subtotal}
            discountAmount={discountAmount}
            discountPercent={discountPercent}
            total={total}
            environmentalFee={financials.environmentalFee}
            salesTax={financials.salesTax}
            finalTotal={financials.finalTotal}
            formatDisplayDate={formatDisplayDate}
            getEstimatedDeliveryDate={getEstimatedDeliveryDate}
            onBack={() => setStep(3)}
            onContinue={() => setStep(5)}
          />
        )}

        {step === 5 && (
          <StepPayment
            serviceType={serviceType}
            cardNumber={cardNumber}
            setCardNumber={setCardNumber}
            cardExpiry={cardExpiry}
            setCardExpiry={setCardExpiry}
            cardCvc={cardCvc}
            setCardCvc={setCardCvc}
            total={total}
            isLoading={submitBookingMutation.isPending}
            onBack={() => setStep(4)}
            onCompleteBooking={handleCompleteBooking}
          />
        )}

        {step === 6 && confirmedOrder && (
          <StepConfirmation
            confirmedOrder={confirmedOrder}
            pickupDate={pickupDate}
            pickupWindow={pickupWindow}
          />
        )}
      </div>
    </div>
  );
}
