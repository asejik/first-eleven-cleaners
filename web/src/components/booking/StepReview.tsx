import Link from 'next/link';
import { Card, Input, Button } from '@/components/ui';
import { DRY_CLEAN_PRICES, ROUTES } from '@/lib/constants';
import styles from '@/app/book/page.module.css';

interface StepReviewProps {
  street: string;
  unit: string;
  city: string;
  zip: string;
  pickupDate: string;
  pickupWindow: 'morning' | 'evening';
  expressTier: 'standard' | 'express_8hr' | 'express_4hr';
  frequency?: 'one_time' | 'weekly' | 'biweekly';
  fullName: string;
  phone: string;
  serviceType: 'dry_clean' | 'wash_fold' | 'mixed';
  washFoldWeight: number;
  calculatedWashFold: number;
  dryCleanQuantities: Record<string, number>;
  expressMultiplier: number;
  expressSurcharge: number;
  promoCodeInput: string;
  setPromoCodeInput: (val: string) => void;
  appliedPromo: { code: string; discount_value: number } | null;
  handleApplyPromo: () => void;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  total: number;
  formatDisplayDate: (dateStr: string) => string;
  getEstimatedDeliveryDate: (pickupDateStr: string, tier?: 'standard' | 'express_8hr' | 'express_4hr') => string;
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
  expressMultiplier,
  expressSurcharge,
  promoCodeInput,
  setPromoCodeInput,
  appliedPromo,
  handleApplyPromo,
  subtotal,
  discountAmount,
  discountPercent,
  total,
  formatDisplayDate,
  getEstimatedDeliveryDate,
  onBack,
  onContinue,
}: StepReviewProps) {
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
            <strong>Guaranteed Delivery:</strong> {getEstimatedDeliveryDate(pickupDate, expressTier)} ({pickupWindow === 'morning' ? '7:30 - 10:00 AM' : '5:00 - 8:00 PM'})
          </p>
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
        <Button variant="primary" size="lg" onClick={onContinue}>
          Proceed to Payment Vault →
        </Button>
      </div>
    </Card>
  );
}
