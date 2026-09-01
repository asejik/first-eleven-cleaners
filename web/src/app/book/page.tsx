'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  DRY_CLEAN_PRICES,
  WASH_FOLD_PRICE_PER_LB,
  WASH_FOLD_MINIMUM_LBS,
  WASH_FOLD_MINIMUM_PRICE,
  PROMO_CODE_LAUNCH,
  ROUTES,
} from '@/lib/constants';
import { Button, Input, Card, Badge } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import { useAuth } from '@/hooks/useAuth';
import { useAvailableSlots, useValidatePromoCode, useSubmitBooking } from '@/hooks/useBooking';
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
  const router = useRouter();
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

  // Step 2: Services
  const [serviceType, setServiceType] = useState<'dry_clean' | 'wash_fold' | 'mixed'>('mixed');
  const [washFoldWeight, setWashFoldWeight] = useState<number>(15);
  const [dryCleanQuantities, setDryCleanQuantities] = useState<Record<string, number>>({});

  // Step 3: Schedule
  const [expressTier, setExpressTier] = useState<'standard' | 'express_8hr' | 'express_4hr'>('standard');
  const [pickupDate, setPickupDate] = useState<string>(getMinPickupDate('standard'));
  const [pickupWindow, setPickupWindow] = useState<'morning' | 'evening'>('morning');

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
  const expressSurcharge = subtotal * expressMultiplier;
  const discountedSubtotal = subtotal + expressSurcharge;
  const discountPercent = appliedPromo?.discount_value || 0;
  const discountAmount = (discountedSubtotal * discountPercent) / 100;
  const total = Math.max(0, discountedSubtotal - discountAmount);

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
  const handleCompleteBooking = async () => {
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
        schedule: { pickup_date: pickupDate, pickup_window: pickupWindow, express_tier: expressTier },
        pricing: {
          subtotal,
          discount_amount: discountAmount,
          total,
          promo_code: appliedPromo?.code || null,
        },
      };

      const result = await submitBookingMutation.mutateAsync(payload);
      setConfirmedOrder({ order_number: result.order_number, id: result.order.id });
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
        {/* Progress Stepper Bar (1 to 5) */}
        {step < 6 && (
          <div className={styles.stepperWrapper}>
            <div className={styles.stepper}>
              {[
                { s: 1, label: 'Address' },
                { s: 2, label: 'Garments' },
                { s: 3, label: 'Schedule' },
                { s: 4, label: 'Review' },
                { s: 5, label: 'Payment' },
              ].map((item) => (
                <div
                  key={item.s}
                  className={`${styles.stepNode} ${step >= item.s ? styles.activeNode : ''} ${step === item.s ? styles.currentNode : ''}`}
                >
                  <div className={styles.nodeCircle}>{step > item.s ? '✓' : item.s}</div>
                  <span className={styles.nodeLabel}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Address & Customer Details */}
        {step === 1 && (
          <Card variant="bordered" padding="lg" className={styles.flowCard}>
            <h1 className={styles.cardTitle}>Where Should We Pick Up?</h1>
            <p className={styles.cardSubtitle}>Door-to-door coverage across the Dallas-Fort Worth Metroplex.</p>

            <div className={styles.formGrid}>
              <Input
                label="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Alex Morgan"
                required
              />
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@example.com"
                required
              />
              <Input
                label="Mobile Phone (for SMS updates)"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(214) 555-0199"
                required
                helperText="We will send your driver ETA & photo receipt to this number"
              />
              <Input
                label="Street Address"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="4514 Travis St"
                required
              />
              <div className={styles.rowTwo}>
                <Input
                  label="Apt / Suite / Gate Code"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="Apt 304, Gate #1100"
                />
                <Input
                  label="ZIP Code"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="75205"
                  required
                />
              </div>
              <Input
                label="Delivery & Porch Instructions (Optional)"
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="Leave on front porch behind planter, or with building concierge"
              />
            </div>

            <div className={styles.smartCoverageNotice}>
              <span className={styles.noticeEmoji}>🗺️</span>
              <div>
                <strong>Smart Coverage:</strong> No restrictive ZIP fences. We serve all of DFW. Your area is matched with dedicated morning and evening routes.
              </div>
            </div>

            <div className={styles.actionRow}>
              <Button
                variant="primary"
                size="lg"
                onClick={() => setStep(2)}
                disabled={!isStep1Valid}
              >
                Continue to Garments →
              </Button>
            </div>
          </Card>
        )}

        {/* Step 2: Service & Garments */}
        {step === 2 && (
          <Card variant="bordered" padding="lg" className={styles.flowCard}>
            <h1 className={styles.cardTitle}>What Are We Cleaning?</h1>
            <p className={styles.cardSubtitle}>Choose your services and customize your items.</p>

            {/* Service Selector Tabs */}
            <div className={styles.serviceTabs}>
              <button
                type="button"
                className={`${styles.tabBtn} ${serviceType === 'mixed' ? styles.activeTab : ''}`}
                onClick={() => setServiceType('mixed')}
              >
                🧺 + 👔 Both (Wash & Fold + Dry Cleaning)
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${serviceType === 'wash_fold' ? styles.activeTab : ''}`}
                onClick={() => setServiceType('wash_fold')}
              >
                🧺 Wash & Fold Only
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${serviceType === 'dry_clean' ? styles.activeTab : ''}`}
                onClick={() => setServiceType('dry_clean')}
              >
                👔 Dry Cleaning Only
              </button>
            </div>

            {/* Wash & Fold Section */}
            {serviceType !== 'dry_clean' && (
              <div className={styles.serviceSection}>
                <div className={styles.sectionHeader}>
                  <h3>🧺 Wash & Fold (Everyday Laundry)</h3>
                  <Badge variant="success">$3.00 / lb</Badge>
                </div>
                <div className={styles.weightSelector}>
                  <label htmlFor="weightInput">Estimated Weight (lbs):</label>
                  <div className={styles.weightControls}>
                    <input
                      id="weightInput"
                      type="range"
                      min="10"
                      max="60"
                      step="1"
                      value={washFoldWeight}
                      onChange={(e) => setWashFoldWeight(Number(e.target.value))}
                      className={styles.slider}
                    />
                    <span className={styles.weightBadge}>{washFoldWeight} lbs</span>
                  </div>
                  <p className={styles.estimatorHint}>
                    💡 Tip: A typical laundry basket is about 15-20 lbs. Exact weight is verified at intake.
                  </p>
                </div>
                {washFoldWeight < WASH_FOLD_MINIMUM_LBS && (
                  <div className={styles.minimumAlert}>
                    15 lb minimum applies ($45.00 order floor).
                  </div>
                )}

                {/* POS Cross-Sell Attach Recommendation */}
                <div style={{ background: 'var(--color-cream)', padding: '16px', borderRadius: 'var(--radius-xl)', border: '1px solid rgba(201, 161, 74, 0.3)', marginTop: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--color-navy)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ✨ Match-Ready Add-On Recommendation
                    </strong>
                    <Badge variant="success">Zero Extra Delivery Fee</Badge>
                  </div>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-600)', margin: '0 0 10px' }}>
                    Have suits or dress shirts needing care? Bundle them in this pickup with free hanger presentation.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setServiceType('mixed');
                        updateDryCleanQty('suit', 2);
                      }}
                      style={{ background: 'var(--color-navy)', color: 'var(--color-gold)', padding: '8px 12px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      + Add 2 Suits ($19.95/ea)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setServiceType('mixed');
                        updateDryCleanQty('shirt', 3);
                      }}
                      style={{ background: 'var(--color-navy)', color: 'var(--color-gold)', padding: '8px 12px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      + Add 3 Dress Shirts ($8.95/ea)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Dry Cleaning Menu Section */}
            {serviceType !== 'wash_fold' && (
              <div className={styles.serviceSection}>
                <div className={styles.sectionHeader}>
                  <h3>👔 Professional Dry Cleaning Items</h3>
                  <span className={styles.subtext}>Select item quantities</span>
                </div>
                <div className={styles.garmentGrid}>
                  {Object.entries(DRY_CLEAN_PRICES).map(([key, item]) => {
                    const qty = dryCleanQuantities[key] || 0;
                    return (
                      <div key={key} className={styles.garmentItem}>
                        <div>
                          <p className={styles.garmentName}>{item.label}</p>
                          <span className={styles.garmentPrice}>${item.price.toFixed(2)}</span>
                        </div>
                        <div className={styles.qtyBox}>
                          <button
                            type="button"
                            className={styles.qtyBtn}
                            onClick={() => updateDryCleanQty(key, -1)}
                            disabled={qty === 0}
                          >
                            -
                          </button>
                          <span className={styles.qtyNum}>{qty}</span>
                          <button
                            type="button"
                            className={styles.qtyBtn}
                            onClick={() => updateDryCleanQty(key, 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className={styles.buttonSplit}>
              <Button variant="outline" onClick={() => setStep(1)}>
                ← Back
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={() => setStep(3)}
                disabled={!isStep2Valid}
              >
                Choose Pickup Time →
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3: Schedule & Pickup Window */}
        {step === 3 && (
          <Card variant="bordered" padding="lg" className={styles.flowCard}>
            <h1 className={styles.cardTitle}>When Should We Pick Up?</h1>
            <p className={styles.cardSubtitle}>
              48-Hour Match-Ready Turnaround. Operating Monday through Saturday.
            </p>

            <div className={styles.scheduleBox}>
              <Input
                label="Pickup Date"
                type="date"
                value={pickupDate}
                min={getMinPickupDate(expressTier)}
                onChange={(e) => {
                  const val = e.target.value;
                  const minVal = getMinPickupDate(expressTier);
                  if (!val) return;
                  if (val < minVal) {
                    setPickupDate(minVal);
                    addToast({
                      type: 'warning',
                      title: '48-Hour Turnaround Rule',
                      message: `${expressTier === 'standard' ? '48-Hour Standard' : 'Express'} service requires advance booking. Earliest available pickup is ${formatDisplayDate(minVal)}.`,
                    });
                    return;
                  }
                  const [y, m, d] = val.split('-').map(Number);
                  const selectedDay = new Date(y, m - 1, d).getDay();
                  if (selectedDay === 0) {
                    const monday = new Date(y, m - 1, d + 1);
                    const mondayStr = formatLocalDate(monday);
                    setPickupDate(mondayStr);
                    addToast({
                      type: 'warning',
                      title: 'Plant Closed Sundays',
                      message: 'We operate Monday through Saturday. Your pickup date has been moved to Monday.',
                    });
                    return;
                  }
                  setPickupDate(val);
                }}
                helperText={
                  expressTier === 'standard'
                    ? `📅 48-Hr Standard turnaround: Earliest pickup is ${formatDisplayDate(getMinPickupDate('standard'))}.`
                    : `⚡ Express Turnaround: Rush pickup unlocked for ${formatDisplayDate(getMinPickupDate(expressTier))}.`
                }
                required
              />

              {/* Real-time Turnaround & Delivery Timeline Card */}
              {pickupDate && (
                <div style={{
                  background: 'rgba(201, 161, 74, 0.08)',
                  border: '1px solid rgba(201, 161, 74, 0.3)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                  marginBottom: 'var(--space-4)',
                }}>
                  <div>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gold-dark)', fontWeight: 'bold', display: 'block' }}>
                      ✨ Match-Ready Guarantee Timeline
                    </span>
                    <strong style={{ fontSize: '14px', color: 'var(--color-navy)', display: 'block', marginTop: '2px' }}>
                      Pickup: {formatDisplayDate(pickupDate)} → Delivery: {getEstimatedDeliveryDate(pickupDate, expressTier)}
                    </strong>
                  </div>
                  <Badge variant="success">🛡️ 48-Hr Match-Ready</Badge>
                </div>
              )}

              {slotData?.is_available === false && (
                <div className={styles.blackoutAlert}>
                  ⚠️ {slotData.reason || 'No pickups available on this date. Please choose another day.'}
                </div>
              )}

              <div className={styles.windowSelection}>
                <label className={styles.fieldLabel}>Select Pickup Window:</label>
                <div className={styles.windowOptions}>
                  <button
                    type="button"
                    className={`${styles.windowCard} ${pickupWindow === 'morning' ? styles.selectedWindow : ''}`}
                    onClick={() => setPickupWindow('morning')}
                  >
                    <span className={styles.winIcon}>🌅</span>
                    <strong>Morning Window</strong>
                    <span>7:30 AM – 10:00 AM</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.windowCard} ${pickupWindow === 'evening' ? styles.selectedWindow : ''}`}
                    onClick={() => setPickupWindow('evening')}
                  >
                    <span className={styles.winIcon}>🌆</span>
                    <strong>Evening Window</strong>
                    <span>5:00 PM – 8:00 PM</span>
                  </button>
                </div>
              </div>

              {/* Express Tier Turnaround Speed Selector */}
              <div className={styles.expressOptionBox}>
                <div className={styles.expressHeader}>
                  <label className={styles.fieldLabel} style={{ marginBottom: 0 }}>
                    ⚡ Turnaround Speed & Processing:
                  </label>
                  <Badge variant="info">
                    {expressTier === 'standard'
                      ? 'Standard: 48 Hours'
                      : expressTier === 'express_8hr'
                      ? 'Express < 8 Hours (+25%)'
                      : 'Express < 4 Hours (+40%)'}
                  </Badge>
                </div>
                <div className={styles.expressTierOptions}>
                  <button
                    type="button"
                    className={`${styles.tierCard} ${expressTier === 'standard' ? styles.selectedTier : ''}`}
                    onClick={() => handleSelectTier('standard')}
                  >
                    <span className={styles.tierTitle}>48-Hr Standard</span>
                    <span className={styles.tierBadge}>Included</span>
                    <span className={styles.tierDesc}>Match-ready in 48 hours</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.tierCard} ${expressTier === 'express_8hr' ? styles.selectedTier : ''}`}
                    onClick={() => handleSelectTier('express_8hr')}
                  >
                    <span className={styles.tierTitle}>Under 8 Hr Rush</span>
                    <span className={styles.tierBadge}>+25% Surcharge</span>
                    <span className={styles.tierDesc}>Same-day rush return</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.tierCard} ${expressTier === 'express_4hr' ? styles.selectedTier : ''}`}
                    onClick={() => handleSelectTier('express_4hr')}
                  >
                    <span className={styles.tierTitle}>Under 4 Hr VIP</span>
                    <span className={styles.tierBadge}>+40% Surcharge</span>
                    <span className={styles.tierDesc}>Immediate priority plant run</span>
                  </button>
                </div>
                <p className={styles.expressNote} style={{ marginTop: 'var(--space-2)' }}>
                  All orders include contactless porch pickup/delivery with photo-verified chain of custody.
                </p>
              </div>
            </div>

            <div className={styles.buttonSplit}>
              <Button variant="outline" onClick={() => setStep(2)}>
                ← Back
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={() => setStep(4)}
                disabled={!isStep3Valid}
              >
                Review Order & Pricing →
              </Button>
            </div>
          </Card>
        )}

        {/* Step 4: Transparent Review & Promo */}
        {step === 4 && (
          <Card variant="bordered" padding="lg" className={styles.flowCard}>
            <h1 className={styles.cardTitle}>Review Your Order</h1>
            <p className={styles.cardSubtitle}>100% transparent pricing before any commitment.</p>

            <div className={styles.reviewSummary}>
              {/* Pickup info */}
              <div className={styles.summarySection}>
                <h4>📍 Pickup & Delivery Schedule</h4>
                <p>
                  <strong>Address:</strong> {street} {unit && `(${unit})`}, {city}, TX {zip}
                </p>
                <p>
                  <strong>Pickup Date:</strong> {formatDisplayDate(pickupDate)} ({pickupWindow === 'morning' ? '7:30 - 10:00 AM' : '5:00 - 8:00 PM'})
                </p>
                <p>
                  <strong>Guaranteed Delivery:</strong> {getEstimatedDeliveryDate(pickupDate, expressTier)} ({pickupWindow === 'morning' ? '7:30 - 10:00 AM' : '5:00 - 8:00 PM'})
                </p>
                <p>
                  <strong>Contact:</strong> {fullName} ({phone})
                </p>
              </div>

              {/* Itemized breakdown */}
              <div className={styles.summarySection}>
                <h4>🧺 Garment Breakdown</h4>
                {serviceType !== 'dry_clean' && (
                  <div className={styles.summaryLine}>
                    <span>Wash & Fold (~{washFoldWeight} lbs)</span>
                    <span>${calculatedWashFold.toFixed(2)}</span>
                  </div>
                )}
                {Object.entries(dryCleanQuantities).map(([k, q]) => (
                  <div key={k} className={styles.summaryLine}>
                    <span>
                      {q}x {DRY_CLEAN_PRICES[k]?.label}
                    </span>
                    <span>${((DRY_CLEAN_PRICES[k]?.price || 0) * q).toFixed(2)}</span>
                  </div>
                ))}
                <div className={styles.summaryLine}>
                  <span>Turnaround Speed</span>
                  <span style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-navy)' }}>
                    {expressTier === 'standard'
                      ? '48-Hour Match-Ready (Included)'
                      : expressTier === 'express_8hr'
                      ? 'Under 8 Hr Rush (+25%)'
                      : 'Under 4 Hr VIP (+40%)'}
                  </span>
                </div>
                {expressMultiplier > 0 && (
                  <div className={styles.summaryLine}>
                    <span>Express Rush Surcharge</span>
                    <span style={{ color: 'var(--color-gold-dark)', fontWeight: 'var(--font-bold)' }}>
                      +${expressSurcharge.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className={styles.summaryLine}>
                  <span>Door-to-Door Delivery</span>
                  <span className={styles.freeText}>FREE</span>
                </div>
              </div>

              {/* Promo Code Input */}
              <div className={styles.promoSection}>
                <div className={styles.promoInputRow}>
                  <Input
                    placeholder="Enter Promo Code"
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value)}
                  />
                  <Button variant="secondary" onClick={handleApplyPromo}>
                    Apply
                  </Button>
                </div>
                {appliedPromo && (
                  <p className={styles.promoApplied}>
                    ✓ Code <strong>{appliedPromo.code}</strong> applied ({appliedPromo.discount_value}% OFF)
                  </p>
                )}
              </div>

              {/* Total Box */}
              <div className={styles.totalBox}>
                <div className={styles.totalRow}>
                  <span>Garment Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {expressMultiplier > 0 && (
                  <div className={styles.totalRow}>
                    <span>Express Surcharge</span>
                    <span>+${expressSurcharge.toFixed(2)}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className={styles.totalRowDiscount}>
                    <span>Discount ({discountPercent}%)</span>
                    <span>-${discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className={styles.finalTotalRow}>
                  <span>Estimated Total</span>
                  <span className={styles.finalAmount}>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className={styles.buttonSplit}>
              <Button variant="outline" onClick={() => setStep(3)}>
                ← Back
              </Button>
              <Button variant="primary" size="lg" onClick={() => setStep(5)}>
                Proceed to Payment Vault →
              </Button>
            </div>
          </Card>
        )}

        {/* Step 5: Invisible Checkout & Card Setup */}
        {step === 5 && (
          <Card variant="bordered" padding="lg" className={styles.flowCard}>
            <h1 className={styles.cardTitle}>Set Up Invisible Checkout</h1>
            <p className={styles.cardSubtitle}>
              Secure card on file — charged transparently only after intake &amp; photo inspection.
            </p>

            <div className={styles.seeItPayItCallout}>
              <span className={styles.calloutIcon}>📸</span>
              <div>
                <strong>&quot;See It, Then Pay It&quot; Promise:</strong>
                <p>
                  {serviceType === 'mixed'
                    ? 'For Mixed Orders (Wash & Fold + Dry Cleaning), your card is vaulted securely. Our intake team counts your dry clean pieces and weighs your laundry on calibrated scales. You receive full photo verification before the single consolidated charge lands.'
                    : serviceType === 'wash_fold'
                    ? 'For Wash & Fold, your card is held securely on file. Our intake team weighs and photographs your clothes, and sends your digital photo receipt before the charge lands. Zero surprise fees.'
                    : 'Your card is vaulted securely with Square. Garments are inspected and photographed at intake under our Carvana-Standard Garment Passport™ before final processing.'}
                </p>
              </div>
            </div>

            <div className={styles.cardVaultBox}>
              <div className={styles.cardHeaderSmall}>
                <span>🔒 Powered by Square Payments</span>
                <span className={styles.badgeSecure}>256-Bit Encrypted</span>
              </div>
              <Input
                label="Card Number"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="4111 2222 3333 4444"
              />
              <div className={styles.rowTwo}>
                <Input
                  label="Expires"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  placeholder="MM/YY"
                />
                <Input
                  label="CVC"
                  value={cardCvc}
                  onChange={(e) => setCardCvc(e.target.value)}
                  placeholder="CVC"
                />
              </div>
            </div>

            <div className={styles.buttonSplit}>
              <Button variant="outline" onClick={() => setStep(4)}>
                ← Back
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={handleCompleteBooking}
                isLoading={submitBookingMutation.isPending}
              >
                Confirm Pickup (${total.toFixed(2)})
              </Button>
            </div>
          </Card>
        )}

        {/* Step 6: 48-Hour Match-Ready Confirmation */}
        {step === 6 && confirmedOrder && (
          <Card variant="bordered" padding="lg" className={styles.confirmationCard}>
            <div className={styles.confHeader}>
              <Image
                src="/icon.png"
                alt="First Eleven"
                width={52}
                height={52}
                style={{ borderRadius: '12px', margin: '0 auto', display: 'block' }}
              />
              <Badge variant="success" size="md">
                Pickup Scheduled
              </Badge>
              <h1 className={styles.confTitle}>You&apos;re in the Starting Lineup!</h1>
              <p className={styles.confSubtitle}>
                Order #{confirmedOrder.order_number} is confirmed. Our van will arrive on{' '}
                <strong>{pickupDate}</strong> ({pickupWindow === 'morning' ? '7:30 - 10:00 AM' : '5:00 - 8:00 PM'}).
              </p>
            </div>

            {/* Domino's Style 6-Stage Progress Indicator */}
            <div className={styles.trackerContainer}>
              <h3>48-Hour Match-Ready Tracker</h3>
              <div className={styles.stageTimeline}>
                {[
                  { label: 'Booked', icon: '📋', active: true },
                  { label: 'Picked Up', icon: '🚐', active: false },
                  { label: 'Weighed & Photo', icon: '⚖️', active: false },
                  { label: 'In Cleaning', icon: '✨', active: false },
                  { label: 'Out for Delivery', icon: '🚚', active: false },
                  { label: 'Delivered', icon: '✅', active: false },
                ].map((stg, i) => (
                  <div
                    key={stg.label}
                    className={`${styles.stageStep} ${stg.active ? styles.stageActive : ''}`}
                  >
                    <div className={styles.stageDot}>{stg.icon}</div>
                    <span className={styles.stageName}>{stg.label}</span>
                  </div>
                ))}
              </div>
              <p className={styles.trackerNote}>
                📱 We will send SMS and WhatsApp updates with driver ETA and photo receipts at each milestone.
              </p>
            </div>

            <div className={styles.confActions}>
              <Link href={ROUTES.dashboard}>
                <Button variant="primary" size="lg" fullWidth>
                  View in Customer Dashboard
                </Button>
              </Link>
              <Link href={ROUTES.home}>
                <Button variant="outline" fullWidth>
                  Return to Home
                </Button>
              </Link>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
