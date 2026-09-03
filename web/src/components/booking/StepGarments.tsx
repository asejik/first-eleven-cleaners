import { Card, Badge, Button } from '@/components/ui';
import { DRY_CLEAN_PRICES, WASH_FOLD_MINIMUM_LBS } from '@/lib/constants';
import styles from '@/app/book/page.module.css';

interface StepGarmentsProps {
  serviceType: 'dry_clean' | 'wash_fold' | 'mixed';
  setServiceType: (val: 'dry_clean' | 'wash_fold' | 'mixed') => void;
  washFoldWeight: number;
  setWashFoldWeight: (val: number) => void;
  dryCleanQuantities: Record<string, number>;
  updateDryCleanQty: (key: string, delta: number) => void;
  isValid: boolean;
  onBack: () => void;
  onContinue: () => void;
}

export function StepGarments({
  serviceType,
  setServiceType,
  washFoldWeight,
  setWashFoldWeight,
  dryCleanQuantities,
  updateDryCleanQty,
  isValid,
  onBack,
  onContinue,
}: StepGarmentsProps) {
  return (
    <Card variant="bordered" padding="lg" className={styles.flowCard}>
      <h1 className={styles.cardTitle}>What Are We Cleaning?</h1>
      <p className={styles.cardSubtitle}>Choose your services and customize your items.</p>

      {/* Service Selector Tabs */}
      <div className={styles.serviceTabs}>
        <button
          type="button"
          className={`${styles.tabBtn} ${serviceType === 'mixed' ? styles.activeTab : ''}`}
          onClick={() => setServiceType('mixed')}
          aria-pressed={serviceType === 'mixed'}
        >
          🧺 + 👔 Both (Wash &amp; Fold + Dry Cleaning)
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${serviceType === 'wash_fold' ? styles.activeTab : ''}`}
          onClick={() => setServiceType('wash_fold')}
          aria-pressed={serviceType === 'wash_fold'}
        >
          🧺 Wash &amp; Fold Only
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${serviceType === 'dry_clean' ? styles.activeTab : ''}`}
          onClick={() => setServiceType('dry_clean')}
          aria-pressed={serviceType === 'dry_clean'}
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
                      aria-label={`Decrease ${item.label} quantity`}
                    >
                      -
                    </button>
                    <span className={styles.qtyNum} aria-live="polite" aria-atomic="true">
                      {qty}
                    </span>
                    <button
                      type="button"
                      className={styles.qtyBtn}
                      onClick={() => updateDryCleanQty(key, 1)}
                      aria-label={`Increase ${item.label} quantity`}
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
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={onContinue}
          disabled={!isValid}
        >
          Choose Pickup Time →
        </Button>
      </div>
    </Card>
  );
}
