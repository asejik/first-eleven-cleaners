'use client';

import Link from 'next/link';
import { ROUTES } from '@/lib/constants';
import {
  BookingStepper,
  StepAddress,
  StepGarments,
  StepSchedule,
  StepReview,
  StepPayment,
  StepConfirmation,
} from '@/components/booking';
import {
  useBookingState,
  formatDisplayDate,
  formatLocalDate,
  getEstimatedDeliveryDate,
  getMinPickupDate,
} from '@/hooks/useBookingState';
import styles from './page.module.css';

export default function BookingPage() {
  const b = useBookingState();

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Returning Customer Sign-In Prompt */}
        {!b.user && (
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

        <BookingStepper step={b.step} />

        {b.step === 1 && (
          <StepAddress
            fullName={b.fullName}
            setFullName={b.setFullName}
            email={b.email}
            setEmail={b.setEmail}
            phone={b.phone}
            setPhone={b.setPhone}
            street={b.street}
            setStreet={b.setStreet}
            unit={b.unit}
            setUnit={b.setUnit}
            city={b.city}
            setCity={b.setCity}
            zip={b.zip}
            setZip={b.setZip}
            deliveryNotes={b.deliveryNotes}
            setDeliveryNotes={b.setDeliveryNotes}
            detectedZone={b.detectedZone}
            onZoneChange={b.setDetectedZone}
            isValid={b.isStep1Valid}
            onContinue={() => b.setStep(2)}
          />
        )}

        {b.step === 2 && (
          <StepGarments
            serviceType={b.serviceType}
            setServiceType={b.setServiceType}
            washFoldWeight={b.washFoldWeight}
            setWashFoldWeight={b.setWashFoldWeight}
            dryCleanQuantities={b.dryCleanQuantities}
            updateDryCleanQty={b.updateDryCleanQty}
            isValid={b.isStep2Valid}
            onBack={() => b.setStep(1)}
            onContinue={() => b.setStep(3)}
          />
        )}

        {b.step === 3 && (
          <StepSchedule
            expressTier={b.expressTier}
            handleSelectTier={b.handleSelectTier}
            pickupDate={b.pickupDate}
            setPickupDate={b.setPickupDate}
            pickupWindow={b.pickupWindow}
            setPickupWindow={b.setPickupWindow}
            frequency={b.frequency}
            setFrequency={b.setFrequency}
            slotData={b.slotData}
            getMinPickupDate={getMinPickupDate}
            formatDisplayDate={formatDisplayDate}
            formatLocalDate={formatLocalDate}
            getEstimatedDeliveryDate={getEstimatedDeliveryDate}
            onToast={b.addToast}
            hasExcludedGarments={b.hasExcludedGarments}
            isExpressCapacityFull={b.isExpressCapacityFull}
            detectedZone={b.detectedZone}
            isValid={b.isStep3Valid}
            onBack={() => b.setStep(2)}
            onContinue={() => b.setStep(4)}
          />
        )}

        {b.step === 4 && (
          <StepReview
            street={b.street}
            unit={b.unit}
            city={b.city}
            zip={b.zip}
            pickupDate={b.pickupDate}
            pickupWindow={b.pickupWindow}
            expressTier={b.expressTier}
            frequency={b.frequency}
            fullName={b.fullName}
            phone={b.phone}
            serviceType={b.serviceType}
            washFoldWeight={b.washFoldWeight}
            calculatedWashFold={b.calculatedWashFold}
            dryCleanQuantities={b.dryCleanQuantities}
            expressSurcharge={b.expressSurcharge}
            promoCodeInput={b.promoCodeInput}
            setPromoCodeInput={b.setPromoCodeInput}
            appliedPromo={b.appliedPromo}
            handleApplyPromo={b.handleApplyPromo}
            subtotal={b.subtotal}
            discountAmount={b.discountAmount}
            discountPercent={b.discountPercent}
            frequencyDiscount={b.financials.frequencyDiscount}
            promoDiscount={b.financials.promoDiscount}
            total={b.total}
            environmentalFee={b.financials.environmentalFee}
            salesTax={b.financials.salesTax}
            finalTotal={b.financials.finalTotal}
            formatDisplayDate={formatDisplayDate}
            getEstimatedDeliveryDate={getEstimatedDeliveryDate}
            detectedZone={b.detectedZone}
            zoneMinimumGap={b.zoneMinimumGap}
            onBack={() => b.setStep(3)}
            onContinue={() => b.setStep(5)}
          />
        )}

        {b.step === 5 && (
          <StepPayment
            serviceType={b.serviceType}
            cardNumber={b.cardNumber}
            setCardNumber={b.setCardNumber}
            cardExpiry={b.cardExpiry}
            setCardExpiry={b.setCardExpiry}
            cardCvc={b.cardCvc}
            setCardCvc={b.setCardCvc}
            total={b.total}
            isLoading={b.submitBookingMutation.isPending}
            onBack={() => b.setStep(4)}
            onCompleteBooking={b.handleCompleteBooking}
          />
        )}

        {b.step === 6 && b.confirmedOrder && (
          <StepConfirmation
            confirmedOrder={b.confirmedOrder}
            pickupDate={b.pickupDate}
            pickupWindow={b.pickupWindow}
          />
        )}
      </div>
    </div>
  );
}
