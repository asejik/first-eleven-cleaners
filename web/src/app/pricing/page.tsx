'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  DRY_CLEAN_PRICES,
  WASH_FOLD_PRICE_PER_LB,
  WASH_FOLD_MINIMUM_LBS,
  WASH_FOLD_MINIMUM_PRICE,
  EXPRESS_8HR_SURCHARGE,
  EXPRESS_4HR_SURCHARGE,
  ROUTES,
  FAILED_PICKUP_FEE,
  calculateOrderFinancials,
} from '@/lib/constants';
import { Button, Card } from '@/components/ui';
import styles from './page.module.css';

export default function PricingPage() {
  // Live Calculator State
  const [washFoldWeight, setWashFoldWeight] = useState<number>(15);
  const [dryCleanQuantities, setDryCleanQuantities] = useState<Record<string, number>>({});
  const [selectedExpress, setSelectedExpress] = useState<'standard' | 'express_8hr' | 'express_4hr'>('standard');

  const updateQuantity = (key: string, delta: number) => {
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

  // Calculations
  const calculatedWashFold =
    washFoldWeight > 0
      ? Math.max(WASH_FOLD_MINIMUM_PRICE, washFoldWeight * WASH_FOLD_PRICE_PER_LB)
      : 0;

  const calculatedDryClean = Object.entries(dryCleanQuantities).reduce((acc, [key, qty]) => {
    const item = DRY_CLEAN_PRICES[key];
    return acc + (item ? item.price * qty : 0);
  }, 0);

  const subtotal = calculatedWashFold + calculatedDryClean;

  const expressMultiplier =
    selectedExpress === 'express_8hr'
      ? EXPRESS_8HR_SURCHARGE
      : selectedExpress === 'express_4hr'
      ? EXPRESS_4HR_SURCHARGE
      : 0;

  const financials = calculateOrderFinancials({
    subtotal,
    expressMultiplier,
    discountPercent: 0,
  });

  const totalDryCleanItems = Object.values(dryCleanQuantities).reduce((a, b) => a + b, 0);

  return (
    <div className={styles.page}>
      {/* === Hero Header === */}
      <section className={styles.headerSection}>
        <div className={styles.container}>
          <span className={styles.badge}>100% Transparent Published Pricing</span>
          <h1 className={styles.pageTitle}>Simple, Honest Pricing. Zero Surprises.</h1>
          <p className={styles.pageSubtitle}>
            Every price appears on our cards, booking screens, and receipts before your clothes change hands.
            No hidden delivery fees, no surprise service surcharges.
          </p>
        </div>
      </section>

      {/* === Interactive Calculator & Price Card Grid === */}
      <div className={`${styles.container} ${styles.mainContent}`}>
        <div className={styles.layoutGrid}>
          {/* Left Column: Price Cards */}
          <div className={styles.pricingTables}>
            {/* Wash & Fold Card */}
            <Card variant="bordered" padding="lg" className={styles.priceCard}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.cardIcon}>🧺</span>
                  <h2 className={styles.cardTitle}>Wash & Fold (Everyday Laundry)</h2>
                </div>
                <div className={styles.priceTag}>
                  <span className={styles.priceNumber}>${WASH_FOLD_PRICE_PER_LB.toFixed(2)}</span>
                  <span className={styles.priceUnit}>/ lb</span>
                </div>
              </div>

              <p className={styles.cardDescription}>
                Clothes washed, dried, sorted, neatly folded, and packaged in protective garment bags.
              </p>

              <div className={styles.minimumNotice}>
                <span className={styles.noticeIcon}>ℹ️</span>
                <div>
                  <strong>{WASH_FOLD_MINIMUM_LBS}-Pound Published Minimum:</strong> ${WASH_FOLD_MINIMUM_PRICE.toFixed(2)} order floor.
                  Orders under {WASH_FOLD_MINIMUM_LBS} lbs are billed at the ${WASH_FOLD_MINIMUM_PRICE.toFixed(0)} minimum floor.
                </div>
              </div>

              <div className={styles.featureList}>
                <div className={styles.featureItem}>✓ Premium hypoallergenic detergent options</div>
                <div className={styles.featureItem}>✓ Color separation & temperature tuning</div>
                <div className={styles.featureItem}>✓ Free pickup & delivery across DFW</div>
              </div>
            </Card>

            {/* Dry Cleaning Menu */}
            <Card variant="bordered" padding="lg" className={styles.priceCard}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.cardIcon}>👔</span>
                  <h2 className={styles.cardTitle}>Professional Dry Cleaning</h2>
                </div>
                <span className={styles.perItemBadge}>Published Rate Card</span>
              </div>

              <p className={styles.cardDescription}>
                Individual inspection, specialty stain treatment, eco-friendly solvents, and hand-pressed finishing.
              </p>

              <div className={styles.menuGrid}>
                {Object.entries(DRY_CLEAN_PRICES).map(([key, item]) => {
                  const qty = dryCleanQuantities[key] || 0;
                  return (
                    <div key={key} className={styles.menuRow}>
                      <div className={styles.itemInfo}>
                        <span className={styles.itemName}>{item.label}</span>
                        <span className={styles.itemPrice}>${item.price.toFixed(2)}</span>
                      </div>
                      <div className={styles.quantityControls}>
                        <button
                          type="button"
                          className={styles.qtyBtn}
                          onClick={() => updateQuantity(key, -1)}
                          disabled={qty === 0}
                          aria-label={`Decrease ${item.label}`}
                        >
                          -
                        </button>
                        <span className={styles.qtyValue}>{qty}</span>
                        <button
                          type="button"
                          className={styles.qtyBtn}
                          onClick={() => updateQuantity(key, 1)}
                          aria-label={`Increase ${item.label}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Express Tiers Card */}
            <Card variant="surface" padding="lg" className={styles.expressCard}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.cardIcon}>⚡</span>
                  <h2 className={styles.cardTitle}>Express & Rush Tiers</h2>
                </div>
                <span className={styles.statusBadge}>Capacity Governed</span>
              </div>
              <p className={styles.cardDescription}>
                Proven at the FIFA World Cup IBC for mission-critical turnaround needs.
              </p>
              <div className={styles.expressGrid}>
                <div className={styles.expressBox}>
                  <strong>Under 8 Hours</strong>
                  <p>+25% Surcharge</p>
                  <span>Capacity Permitting</span>
                </div>
                <div className={styles.expressBox}>
                  <strong>Under 4 Hours</strong>
                  <p>+40% Rush</p>
                  <span>Capacity Permitting</span>
                </div>
              </div>
            </Card>

            {/* Failed Pickup / Delivery Fee Card */}
            <Card variant="bordered" padding="lg" className={styles.priceCard}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.cardIcon}>🚐</span>
                  <h2 className={styles.cardTitle}>Failed Pickup or Delivery — ${FAILED_PICKUP_FEE.toFixed(0)}</h2>
                </div>
                <span className={styles.perItemBadge}>Policy Clarity</span>
              </div>

              <p className={styles.cardDescription}>
                If our driver arrives during your confirmed service window but cannot complete the pickup or delivery because the order is unavailable, access information is incorrect or incomplete, or the required recipient is unavailable, a ${FAILED_PICKUP_FEE.toFixed(0)} failed-service fee may apply.
              </p>

              <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: 'var(--text-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-cream)', borderRadius: 'var(--radius-md)' }}>
                  <span>First occurrence:</span>
                  <strong style={{ color: 'var(--color-green)' }}>Waived as a courtesy</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-cream)', borderRadius: 'var(--radius-md)' }}>
                  <span>Customer reschedules &ge;2 hours beforehand:</span>
                  <strong style={{ color: 'var(--color-green)' }}>$0 (Free)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-cream)', borderRadius: 'var(--radius-md)' }}>
                  <span>First Eleven courier or plant fault:</span>
                  <strong style={{ color: 'var(--color-green)' }}>$0 (Free)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 'var(--radius-md)' }}>
                  <span>Repeat unnotified failed attempt:</span>
                  <strong style={{ color: 'var(--color-error)' }}>${FAILED_PICKUP_FEE.toFixed(2)}</strong>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column: Live Sticky Calculator */}
          <div className={styles.calculatorColumn}>
            <Card variant="bordered" padding="lg" className={styles.calculatorCard}>
              <h3 className={styles.calcTitle}>Live Estimate Calculator</h3>
              <p className={styles.calcSubtitle}>Adjust items and weight to estimate your total</p>

              <div className={styles.calcBody}>
                {/* Wash & Fold Slider */}
                <div className={styles.calcSection}>
                  <div className={styles.calcRowHeader}>
                    <label htmlFor="weightSlider">Wash &amp; Fold Weight:</label>
                    <span className={styles.weightValue}>{washFoldWeight} lbs</span>
                  </div>
                  <input
                    id="weightSlider"
                    type="range"
                    min="0"
                    max="60"
                    step="1"
                    value={washFoldWeight}
                    onChange={(e) => setWashFoldWeight(Number(e.target.value))}
                    className={styles.rangeSlider}
                  />
                  {washFoldWeight > 0 && washFoldWeight < WASH_FOLD_MINIMUM_LBS && (
                    <p className={styles.floorNotice}>
                      * {washFoldWeight} lbs is under our 15 lb minimum. The $45.00 order floor applies.
                    </p>
                  )}
                </div>

                {/* Dry Clean Summary */}
                <div className={styles.calcSection}>
                  <div className={styles.calcRowHeader}>
                    <span>Dry Clean Garments:</span>
                    <span>{totalDryCleanItems} items</span>
                  </div>
                  {totalDryCleanItems > 0 ? (
                    <ul className={styles.selectedItemsList}>
                      {Object.entries(dryCleanQuantities).map(([key, qty]) => {
                        const item = DRY_CLEAN_PRICES[key];
                        if (!item || qty === 0) return null;
                        return (
                          <li key={key} className={styles.selectedItem}>
                            <span>
                              {qty}x {item.label}
                            </span>
                            <span>${(qty * item.price).toFixed(2)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className={styles.emptyNote}>Use the + buttons on the left to add dry cleaning items.</p>
                  )}
                </div>

                {/* Express Options */}
                <div className={styles.calcSection}>
                  <span className={styles.calcLabel}>Turnaround Speed:</span>
                  <div className={styles.expressOptions}>
                    <button
                      type="button"
                      className={`${styles.expressOptionBtn} ${selectedExpress === 'standard' ? styles.activeOption : ''}`}
                      onClick={() => setSelectedExpress('standard')}
                    >
                      48-Hr Standard (Included)
                    </button>
                    <button
                      type="button"
                      className={`${styles.expressOptionBtn} ${selectedExpress === 'express_8hr' ? styles.activeOption : ''}`}
                      onClick={() => setSelectedExpress('express_8hr')}
                    >
                      Under 8 Hr (+25%)
                    </button>
                    <button
                      type="button"
                      className={`${styles.expressOptionBtn} ${selectedExpress === 'express_4hr' ? styles.activeOption : ''}`}
                      onClick={() => setSelectedExpress('express_4hr')}
                    >
                      Under 4 Hr (+40%)
                    </button>
                  </div>
                </div>

                {/* Total Breakdown */}
                <div className={styles.breakdown}>
                  {washFoldWeight > 0 && (
                    <div className={styles.breakdownRow}>
                      <span>Wash &amp; Fold ({washFoldWeight} lbs)</span>
                      <span>${calculatedWashFold.toFixed(2)}</span>
                    </div>
                  )}
                  {calculatedDryClean > 0 && (
                    <div className={styles.breakdownRow}>
                      <span>Dry Cleaning ({totalDryCleanItems} items)</span>
                      <span>${calculatedDryClean.toFixed(2)}</span>
                    </div>
                  )}
                  {financials.expressSurcharge > 0 && (
                    <div className={styles.breakdownRow}>
                      <span>Express Surcharge</span>
                      <span>+${financials.expressSurcharge.toFixed(2)}</span>
                    </div>
                  )}
                  <div className={styles.breakdownRow}>
                    <span>Door-to-Door Pickup &amp; Delivery</span>
                    <span className={styles.freeBadge}>FREE</span>
                  </div>
                  {financials.subtotal > 0 && (
                    <>
                      <div className={styles.breakdownRow}>
                        <span>Environmental Fee (3%)</span>
                        <span>+${financials.environmentalFee.toFixed(2)}</span>
                      </div>
                      <div className={styles.breakdownRow}>
                        <span>Texas Sales Tax (8.25%)</span>
                        <span>+${financials.salesTax.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div className={styles.totalRow}>
                    <span>Estimated Total</span>
                    <span className={styles.totalAmount}>${financials.finalTotal.toFixed(2)}</span>
                  </div>
                </div>

                <Link href={ROUTES.book}>
                  <Button variant="primary" fullWidth size="lg">
                    Schedule Pickup with this Order
                  </Button>
                </Link>
                <p className={styles.promiseCallout}>
                  🔒 You see the itemized photos and final ticket before any charge is made.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
