import { useState } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import {
  DRY_CLEAN_PRICES,
  WASH_FOLD_MINIMUM_LBS,
  catalogItems,
  catalogPriceLabel,
  type CatalogCategory,
} from '@/lib/constants';
import { SUIT_PRICE } from '@/lib/ai/price-list';
import type { AlterationDraft } from '@/lib/alterations';
import { AlterationsSection } from './AlterationsSection';
import styles from '@/app/book/page.module.css';

interface StepGarmentsProps {
  serviceType: 'dry_clean' | 'wash_fold' | 'mixed';
  setServiceType: (val: 'dry_clean' | 'wash_fold' | 'mixed') => void;
  washFoldWeight: number;
  setWashFoldWeight: (val: number) => void;
  dryCleanQuantities: Record<string, number>;
  updateDryCleanQty: (key: string, delta: number) => void;
  alterationLines: AlterationDraft[];
  onAddAlteration: (garmentType: string) => void;
  onUpdateAlteration: (uid: string, patch: Partial<AlterationDraft>) => void;
  onRemoveAlteration: (uid: string) => void;
  /** Buttons alone can't be booked */
  buttonsOnlyMessage?: string | null;
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
  alterationLines,
  onAddAlteration,
  onUpdateAlteration,
  onRemoveAlteration,
  buttonsOnlyMessage,
  isValid,
  onBack,
  onContinue,
}: StepGarmentsProps) {
  // One announcement naming the item ("Shirt / Blouse (dry clean): 2"), instead of each
  // counter announcing a bare number (SR-07)
  const [qtyAnnouncement, setQtyAnnouncement] = useState('');
  const changeQty = (key: string, delta: number) => {
    const next = Math.max(0, (dryCleanQuantities[key] || 0) + delta);
    updateDryCleanQty(key, delta);
    setQtyAnnouncement(`${DRY_CLEAN_PRICES[key].label}: ${next}`);
  };

  const renderGrid = (category: CatalogCategory) => (
    <div className={styles.garmentGrid}>
      {catalogItems(category).map(([key, item]) => {
        const qty = dryCleanQuantities[key] || 0;
        return (
          <div key={key} className={styles.garmentItem}>
            <div>
              <p className={styles.garmentName}>{item.label}</p>
              <span className={styles.garmentPrice}>{catalogPriceLabel(item)}</span>
              {item.note && <span className={styles.garmentNote}>{item.note}</span>}
            </div>
            <div className={styles.qtyBox}>
              <button
                type="button"
                className={styles.qtyBtn}
                onClick={() => changeQty(key, -1)}
                disabled={qty === 0}
                aria-label={`Decrease ${item.label} quantity`}
              >
                -
              </button>
              <span className={styles.qtyNum}>
                {qty}
              </span>
              <button
                type="button"
                className={styles.qtyBtn}
                onClick={() => changeQty(key, 1)}
                aria-label={`Increase ${item.label} quantity`}
              >
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

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
          <span aria-hidden="true">🧺 + 👔</span> Both (Wash &amp; Fold + Dry Cleaning)
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${serviceType === 'wash_fold' ? styles.activeTab : ''}`}
          onClick={() => setServiceType('wash_fold')}
          aria-pressed={serviceType === 'wash_fold'}
        >
          <span aria-hidden="true">🧺</span> Wash &amp; Fold Only
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${serviceType === 'dry_clean' ? styles.activeTab : ''}`}
          onClick={() => setServiceType('dry_clean')}
          aria-pressed={serviceType === 'dry_clean'}
        >
          <span aria-hidden="true">👔</span> Dry Cleaning Only
        </button>
      </div>

      {/* Wash & Fold Section */}
      {serviceType !== 'dry_clean' && (
        <div className={styles.serviceSection}>
          <div className={styles.sectionHeader}>
            <h2><span aria-hidden="true">🧺</span> Wash & Fold (Everyday Laundry)</h2>
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
                  // A two-piece suit is a jacket plus pants
                  updateDryCleanQty('jacket', 1);
                  updateDryCleanQty('pants_skirt', 1);
                }}
                style={{ background: 'var(--color-navy)', color: 'var(--color-gold)', padding: '8px 12px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                + Add a 2-Piece Suit (${SUIT_PRICE.toFixed(2)})
              </button>
              <button
                type="button"
                onClick={() => {
                  setServiceType('mixed');
                  updateDryCleanQty('laundered_shirt', 3);
                }}
                style={{ background: 'var(--color-navy)', color: 'var(--color-gold)', padding: '8px 12px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                + Add 3 Laundered Shirts (${DRY_CLEAN_PRICES.laundered_shirt.price.toFixed(2)}/ea)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dry Cleaning Menu Section */}
      {serviceType !== 'wash_fold' && (
        <div className={styles.serviceSection}>
          <div className={styles.sectionHeader}>
            <h2><span aria-hidden="true">👔</span> Professional Dry Cleaning Items</h2>
            <span className={styles.subtext}>Select item quantities</span>
          </div>
          <p className="sr-only" role="status" aria-live="polite">{qtyAnnouncement}</p>
          {renderGrid('dry_clean')}
          <div className={styles.sectionHeader} style={{ marginTop: 'var(--space-6)' }}>
            <h2><span aria-hidden="true">🛏️</span> Household Items</h2>
            <span className={styles.subtext}>Comforters, linens &amp; drapes</span>
          </div>
          {renderGrid('household')}
          <AlterationsSection
            lines={alterationLines}
            onAdd={onAddAlteration}
            onUpdate={onUpdateAlteration}
            onRemove={onRemoveAlteration}
          />
          {buttonsOnlyMessage && (
            <p role="alert" className={styles.minimumAlert} style={{ marginTop: 'var(--space-4)' }}>
              {buttonsOnlyMessage}
            </p>
          )}
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
