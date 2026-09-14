import Link from 'next/link';
import { Card, Input, Button } from '@/components/ui';
import { DRY_CLEAN_PRICES, ROUTES, type ZoneConfig } from '@/lib/constants';
import styles from '@/app/book/page.module.css';

interface StepReviewProps {
  street: string;
  unit: string;
  city: string;
  zip: string;
  pickupDate: string;
  pickupWindow: 'morning' | 'evening';
  expressTier: 'standard' | 'express_24hr';
  frequency?: 'one_time' | 'weekly' | 'biweekly';
  fullName: string;
  phone: string;
  serviceType: 'dry_clean' | 'wash_fold' | 'mixed';
  washFoldWeight: number;
  calculatedWashFold: number;
  dryCleanQuantities: Record<string, number>;
  expressMultiplier?: number;
  expressSurcharge: number;
  promoCodeInput: string;
  setPromoCodeInput: (val: string) => void;
  appliedPromo: { code: string; discount_value: number } | null;
  handleApplyPromo: () => void;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  frequencyDiscount?: number;
  promoDiscount?: number;
  total: number;
  environmentalFee?: number;
  salesTax?: number;
  finalTotal?: number;
  formatDisplayDate: (dateStr: string) => string;
  getEstimatedDeliveryDate: (pickupDateStr: string, tier?: 'standard' | 'express_24hr') => string;
  detectedZone?: ZoneConfig | null;
  zoneMinimumGap?: number;
  onBack: () => void;
  onContinue: () => void;
}

export function StepReview({
  street,
  unit,
  city,
  zip,
  pickupDate,
  pickupWindow,
  expressTier,
  frequency,
  fullName,
  phone,
  serviceType,
  washFoldWeight,
  calculatedWashFold,
  dryCleanQuantities,
  expressMultiplier: _expressMultiplier = 0,
  expressSurcharge,
  promoCodeInput,
  setPromoCodeInput,
  appliedPromo,
  handleApplyPromo,
  subtotal,
  discountAmount,
  discountPercent,
  frequencyDiscount = 0,
  promoDiscount = 0,
  total,
  environmentalFee,
  salesTax,
  finalTotal,
  formatDisplayDate,
  getEstimatedDeliveryDate,
  detectedZone,
  zoneMinimumGap = 0,
  onBack,
  onContinue,
}: StepReviewProps) {
  const isExpress24 = expressTier === 'express_24hr';
  return (
    <Card variant="bordered" padding="lg" className={styles.flowCard}>
      <h1 className={styles.cardTitle}>Review Your Order</h1>
      <p className={styles.cardSubtitle}>100% transparent pricing before any commitment.</p>

      <div className={styles.reviewSummary}>
        {/* Pickup info */}
        <div className={styles.summarySection}>
          <h4>📍 Pickup &amp; Delivery Schedule</h4>
          <p>
            <strong>Address:</strong> {street} {unit && `(${unit})`}, {city}, TX {zip}
          </p>
          <p>
            <strong>Pickup Date:</strong> {formatDisplayDate(pickupDate)} ({pickupWindow === 'morning' ? '7:30 - 10:00 AM' : '5:00 - 8:00 PM'})
          </p>
          <p>
            <strong>Guaranteed Delivery:</strong> {getEstimatedDeliveryDate(pickupDate, expressTier)} ({isExpress24 ? 'Morning 7:30 - 10:00 AM' : (pickupWindow === 'morning' ? '7:30 - 10:00 AM' : '5:00 - 8:00 PM')})
          </p>
          {isExpress24 && (
            <p style={{ color: 'var(--color-gold-dark)', fontSize: 'var(--text-xs)', fontWeight: 'bold' }}>
              ⚡ 24-Hour Guarantee: Delivered by 10:00 AM or your Express surcharge is refunded automatically.
            </p>
          )}
          {frequency && frequency !== 'one_time' && (
            <p style={{ color: 'var(--color-green)' }}>
              <strong>Recurring Plan:</strong> {frequency === 'weekly' ? '⚡ Weekly Recurring (10% Off Applied)' : '📅 Bi-Weekly Recurring (5% Off Applied)'}
            </p>
          )}
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
            <span style={{ fontWeight: 'var(--font-semibold)', color: isExpress24 ? 'var(--color-gold-dark)' : 'var(--color-navy)' }}>
              {isExpress24
                ? '⚡ 24-Hour Express (Match-Ready Tomorrow)'
                : '48-Hour Match-Ready (Included)'}
            </span>
          </div>
          {expressSurcharge > 0 && (
            <div className={styles.summaryLine}>
              <span>Express Surcharge (+50%, min $15)</span>
              <span style={{ color: 'var(--color-gold-dark)', fontWeight: 'var(--font-bold)' }}>
                +${expressSurcharge.toFixed(2)}
              </span>
            </div>
          )}
          <div className={styles.summaryLine}>
            <span>Door-to-Door Delivery</span>
            <span className={styles.freeText}>FREE</span>
          </div>
          {detectedZone && (
            <div className={styles.summaryLine}>
              <span>Area Coverage Minimum</span>
              <span style={{ fontWeight: '600', color: 'var(--color-navy)' }}>
                ${detectedZone.minimumOrder.toFixed(0)}.00 ({detectedZone.name})
              </span>
            </div>
          )}
        </div>

        {/* Promo Code Input */}
        <div className={styles.promoSection}>
          <div className={styles.promoInputRow}>
            <Input
              id="promo-code-input"
              aria-label="Enter Promo Code"
              placeholder="Enter Promo Code"
              value={promoCodeInput}
              onChange={(e) => setPromoCodeInput(e.target.value)}
            />
            <Button
              variant="secondary"
              onClick={handleApplyPromo}
              aria-label="Apply promo code"
            >
              Apply
            </Button>
          </div>
          {appliedPromo && (
            <p className={styles.promoApplied}>
              ✓ Code <strong>{appliedPromo.code}</strong> applied ({appliedPromo.discount_value}% OFF)
            </p>
          )}
        </div>

        {/* Zone Minimum Gap Notice */}
        {zoneMinimumGap > 0 && detectedZone && (
          <div className={styles.gapNotice}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <div>
              <div className={styles.gapNoticeTitle}>
                Add ${zoneMinimumGap.toFixed(2)} to reach your area&apos;s ${detectedZone.minimumOrder.toFixed(0)} minimum
              </div>
              <div className={styles.gapNoticeText}>
                {detectedZone.name} has a ${detectedZone.minimumOrder.toFixed(0)} order minimum for complimentary door-to-door courier service. Your garment subtotal is currently ${subtotal.toFixed(2)}. Please add more dry clean garments or increase wash &amp; fold weight to proceed.
              </div>
            </div>
          </div>
        )}

        {/* Total Box */}
        <div className={styles.totalBox}>
          <div className={styles.totalRow}>
            <span>Garment Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          {expressSurcharge > 0 && (
            <div className={styles.totalRow}>
              <span>24-Hour Express Surcharge (+50%, min $15)</span>
              <span style={{ color: 'var(--color-gold-dark)', fontWeight: 'bold' }}>
                +${expressSurcharge.toFixed(2)}
              </span>
            </div>
          )}
          {frequencyDiscount > 0 && (
            <div className={styles.totalRowDiscount}>
              <span>
                {frequency === 'weekly' ? '⚡ Weekly Recurring Plan (10% Off)' : '📅 Bi-Weekly Recurring Plan (5% Off)'}
              </span>
              <span>-${frequencyDiscount.toFixed(2)}</span>
            </div>
          )}
          {promoDiscount > 0 && (
            <div className={styles.totalRowDiscount}>
              <span>Promo Code ({appliedPromo?.code || 'Code'} - {discountPercent}%)</span>
              <span>-${promoDiscount.toFixed(2)}</span>
            </div>
          )}
          {frequencyDiscount <= 0 && promoDiscount <= 0 && discountAmount > 0 && (
            <div className={styles.totalRowDiscount}>
              <span>Discount ({discountPercent}%)</span>
              <span>-${discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div className={styles.totalRow}>
            <span>Door-to-Door Delivery</span>
            <span style={{ color: 'var(--color-green)', fontWeight: 'bold' }}>FREE</span>
          </div>
          {environmentalFee !== undefined && environmentalFee > 0 && (
            <div className={styles.totalRow}>
              <span>Environmental Fee (3%)</span>
              <span>+${environmentalFee.toFixed(2)}</span>
            </div>
          )}
          {salesTax !== undefined && salesTax > 0 && (
            <div className={styles.totalRow}>
              <span>Texas Sales Tax (8.25%)</span>
              <span>+${salesTax.toFixed(2)}</span>
            </div>
          )}
          <div className={styles.finalTotalRow}>
            <span>Authorized Total</span>
            <span className={styles.finalAmount}>${(finalTotal ?? total).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textAlign: 'center', marginTop: 'var(--space-4)', marginBottom: 'var(--space-3)', lineHeight: 'var(--leading-relaxed)' }}>
        By scheduling this pickup, you agree to our{' '}
        <Link href={ROUTES.terms} target="_blank" style={{ color: 'var(--color-navy)', fontWeight: 'bold', textDecoration: 'underline' }}>
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href={ROUTES.privacy} target="_blank" style={{ color: 'var(--color-navy)', fontWeight: 'bold', textDecoration: 'underline' }}>
          Privacy Policy
        </Link>
        . Card on file is verified and only settled once garments are weighed and inspected at intake.
      </p>

      <div className={styles.buttonSplit}>
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={onContinue}
          disabled={zoneMinimumGap > 0}
        >
          {zoneMinimumGap > 0
            ? `Add $${zoneMinimumGap.toFixed(2)} to Reach Minimum`
            : 'Proceed to Payment Vault →'}
        </Button>
      </div>
    </Card>
  );
}
