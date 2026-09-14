'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  DRY_CLEAN_PRICES,
  WASH_FOLD_PRICE_PER_LB,
  WASH_FOLD_MINIMUM_LBS,
  WASH_FOLD_MINIMUM_PRICE,
  ROUTES,
  FAILED_PICKUP_FEE,
  calculateOrderFinancials,
  resolveZoneByZip,
  getZoneMinimumGap,
} from '@/lib/constants';
import { Button, Card } from '@/components/ui';
import styles from './page.module.css';

export default function PricingPage() {
  // Live Calculator State
  const [washFoldWeight, setWashFoldWeight] = useState<number>(15);
  const [dryCleanQuantities, setDryCleanQuantities] = useState<Record<string, number>>({});
  const [selectedExpress, setSelectedExpress] = useState<'standard' | 'express_24hr'>('standard');
  const [calcZip, setCalcZip] = useState<string>('75205');

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
  const calcZone = resolveZoneByZip(calcZip);
  const zoneGap = getZoneMinimumGap(subtotal, calcZone);

  const financials = calculateOrderFinancials({
    subtotal,
    isExpress: selectedExpress === 'express_24hr' && Boolean(calcZone?.expressEligible),
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

            {/* 24-Hour Express Card */}
            <Card variant="surface" padding="lg" className={styles.expressCard}>
              <div className={styles.cardHeader}>
                <div>
                  <span className={styles.cardIcon}>⚡</span>
                  <h2 className={styles.cardTitle}>24-Hour Express — Match-Ready Tomorrow</h2>
                </div>
                <span className={styles.statusBadge}>Capacity Governed</span>
              </div>
              <p className={styles.expressPromise}>
                Picked up this morning, delivered tomorrow morning. Order by 9 PM tonight to make tomorrow&apos;s Express pickup.
              </p>
              <div className={styles.expressDetailsBox}>
                <div className={styles.expressPricingHighlight}>
                  <strong className={styles.expressSurchargeText}>+50% Surcharge</strong>
                  <span className={styles.expressMinText}>(minimum $15) — shown in your total before checkout.</span>
                </div>
                <ul className={styles.expressSpecList}>
                  <li>
                    <span>📅</span>
                    <div>
                      <strong>Monday–Friday pickups</strong> · Limited daily slots · Excludes specialty &amp; leather care.
                    </div>
                  </li>
                  <li>
                    <span>🛡️</span>
                    <div>
                      <strong>On-Time Guarantee</strong> · Miss the 10:00 AM delivery window and the Express fee refunds automatically.
                    </div>
                  </li>
                </ul>
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
                {/* Area Coverage Minimum Widget */}
                <div className={styles.zoneCalcBox}>
                  <div className={styles.calcRowHeader}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', color: 'var(--color-navy)' }}>
                      🗺️ Check Area Minimum:
                    </span>
                    <div className={styles.zoneZipInputRow}>
                      <span style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>ZIP:</span>
                      <input
                        type="text"
                        maxLength={5}
                        value={calcZip}
                        onChange={(e) => setCalcZip(e.target.value)}
                        className={styles.zoneZipInput}
                        aria-label="ZIP Code for zone minimum calculation"
                      />
                    </div>
                  </div>

                  {calcZone ? (
                    <div className={styles.zoneInfoCard}>
                      <div className={styles.zoneNameBadge}>
                        <span>📍 {calcZone.name}</span>
                        <span style={{ color: 'var(--color-green-dark)' }}>${calcZone.minimumOrder.toFixed(0)} min</span>
                      </div>
                      <div className={styles.zoneSpecsSummary}>
                        {calcZone.routeScheduleLabel} · {calcZone.expressEligible ? '⚡ 24-Hr Express Eligible' : 'Standard 48-Hr Only'}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.zoneInfoCard} style={{ borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.05)' }}>
                      <div className={styles.zoneNameBadge} style={{ color: '#dc2626' }}>
                        <span>📍 Outside Service Area</span>
                      </div>
                      <div className={styles.zoneSpecsSummary} style={{ color: 'var(--color-text-secondary)' }}>
                        We currently operate throughout the DFW Metroplex &amp; North Texas (ZIPs 750–754, 760–762).
                      </div>
                    </div>
                  )}

                  {subtotal > 0 && calcZone && zoneGap > 0 && (
                    <div className={styles.zoneGapAlert}>
                      ⚠️ Current subtotal is ${zoneGap.toFixed(2)} below your area&apos;s ${calcZone.minimumOrder.toFixed(0)} minimum. Delivery is always free once minimum is met.
                    </div>
                  )}
                </div>

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
                      className={`${styles.expressOptionBtn} ${selectedExpress === 'express_24hr' ? styles.activeOption : ''}`}
                      onClick={() => {
                        if (calcZone?.expressEligible) {
                          setSelectedExpress('express_24hr');
                        }
                      }}
                      disabled={!calcZone?.expressEligible}
                      style={!calcZone?.expressEligible ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                      title={!calcZone?.expressEligible ? `24-Hour Express unavailable in ${calcZone?.name || 'this area'}` : undefined}
                    >
                      ⚡ 24-Hr Express {calcZone?.expressEligible ? '(+50%, min $15)' : '(Not in Zone)'}
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
                      <span>Express Surcharge (+50%, min $15)</span>
                      <span>+${financials.expressSurcharge.toFixed(2)}</span>
                    </div>
                  )}
                  <div className={styles.breakdownRow}>
                    <span>Door-to-Door Pickup &amp; Delivery</span>
                    <span className={styles.freeBadge}>FREE</span>
                  </div>
                  <div className={styles.breakdownRow}>
                    <span>Area Minimum {calcZone ? `(${calcZone.badge})` : ''}</span>
                    <span style={{ fontWeight: '600', color: 'var(--color-navy)' }}>
                      {calcZone ? `$${calcZone.minimumOrder.toFixed(0)}.00` : 'DFW Delivery'}
                    </span>
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
