'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button, Input, Card, Loader } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import { useCustomerPreferences, useUpdatePreferences } from '@/hooks/usePreferences';
import { ROUTES } from '@/lib/constants';
import type { CustomerPreferences } from '@/types';
import styles from './page.module.css';

interface PreferencesFormProps {
  initial: CustomerPreferences | null | undefined;
}

function PreferencesForm({ initial }: PreferencesFormProps) {
  const updatePreferencesMutation = useUpdatePreferences();
  const addToast = useUIStore((s) => s.addToast);

  const [starchLevel, setStarchLevel] = useState<'none' | 'light' | 'medium' | 'heavy'>(
    initial?.starch_level || 'none'
  );
  const [foldVsHang, setFoldVsHang] = useState<'fold' | 'hang'>(
    initial?.fold_vs_hang || 'hang'
  );
  const [detergentSensitivity, setDetergentSensitivity] = useState(
    initial?.detergent_sensitivity || ''
  );
  const [gateCode, setGateCode] = useState(initial?.gate_code || '');
  const [deliveryInstructions, setDeliveryInstructions] = useState(
    initial?.delivery_instructions || ''
  );
  const [specialNotes, setSpecialNotes] = useState(initial?.special_notes || '');

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await updatePreferencesMutation.mutateAsync({
        starch_level: starchLevel,
        fold_vs_hang: foldVsHang,
        detergent_sensitivity: detergentSensitivity,
        gate_code: gateCode,
        delivery_instructions: deliveryInstructions,
        special_notes: specialNotes,
      });

      addToast({
        type: 'success',
        title: "Eleven's Memory Updated",
        message: 'Your garment preferences have been saved and synced across web, SMS, and WhatsApp.',
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: (err as Error).message || 'Could not save preferences to database.',
      });
    }
  };

  return (
    <form onSubmit={handleSave} className={styles.form}>
      {/* Starch Level */}
      <div className={styles.fieldGroup}>
        <span className={styles.groupLabel}>Shirt Starch Level</span>
        <div className={styles.optionsGrid} role="group" aria-label="Shirt Starch Level">
          {(['none', 'light', 'medium', 'heavy'] as const).map((level) => (
            <button
              key={level}
              type="button"
              className={`${styles.optionCard} ${starchLevel === level ? styles.selectedOption : ''}`}
              onClick={() => setStarchLevel(level)}
              aria-pressed={starchLevel === level}
            >
              <span className={styles.optionCapital}>{level.toUpperCase()}</span>
              <span className={styles.optionDesc}>
                {level === 'none'
                  ? 'Soft natural feel'
                  : level === 'light'
                  ? 'Slight crispness'
                  : level === 'medium'
                  ? 'Firm hold'
                  : 'Maximum stiffness'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Fold vs Hang */}
      <div className={styles.fieldGroup}>
        <span className={styles.groupLabel}>Wash &amp; Fold Presentation</span>
        <div className={styles.optionsGrid} role="group" aria-label="Wash and Fold Presentation">
          <button
            type="button"
            className={`${styles.optionCard} ${foldVsHang === 'hang' ? styles.selectedOption : ''}`}
            onClick={() => setFoldVsHang('hang')}
            aria-pressed={foldVsHang === 'hang'}
          >
            <span className={styles.optionCapital}>👔 ON HANGERS</span>
            <span className={styles.optionDesc}>Suits, button-downs, and dresses hung with tissue</span>
          </button>
          <button
            type="button"
            className={`${styles.optionCard} ${foldVsHang === 'fold' ? styles.selectedOption : ''}`}
            onClick={() => setFoldVsHang('fold')}
            aria-pressed={foldVsHang === 'fold'}
          >
            <span className={styles.optionCapital}>🧺 NEATLY FOLDED</span>
            <span className={styles.optionDesc}>Stacked and wrapped in protective weatherproof wrap</span>
          </button>
        </div>
      </div>

      {/* Detergent & Sensitivities */}
      <div className={styles.fieldGroup}>
        <Input
          id="detergent-sensitivity"
          label="Detergent & Scent Sensitivities"
          placeholder="e.g. Hypoallergenic only, Fragrance-free, Woolite for knits"
          value={detergentSensitivity}
          onChange={(e) => setDetergentSensitivity(e.target.value)}
          helperText="We stock premium botanical eco-friendly detergents."
        />
      </div>

      {/* Gate Code & Porch Instructions */}
      <div className={styles.rowTwo}>
        <Input
          id="gate-code"
          label="Gate Code / Callbox"
          placeholder="#1100"
          value={gateCode}
          onChange={(e) => setGateCode(e.target.value)}
        />
        <Input
          id="delivery-instructions"
          label="Delivery Instructions"
          placeholder="e.g. Behind porch chair"
          value={deliveryInstructions}
          onChange={(e) => setDeliveryInstructions(e.target.value)}
        />
      </div>

      {/* Special Care Notes */}
      <div className={styles.fieldGroup}>
        <label htmlFor="special-notes" className={styles.groupLabel}>Special Care Notes</label>
        <textarea
          id="special-notes"
          className={styles.textarea}
          rows={3}
          placeholder="e.g. Always crease trousers on the seam. Check pockets for cufflinks."
          value={specialNotes}
          onChange={(e) => setSpecialNotes(e.target.value)}
        />
      </div>

      <div className={styles.formActions}>
        <Button
          variant="primary"
          size="lg"
          type="submit"
          isLoading={updatePreferencesMutation.isPending}
        >
          Save Preferences to Eleven&apos;s Memory 💾
        </Button>
      </div>
    </form>
  );
}

export default function PreferencesPage() {
  const { data, isLoading } = useCustomerPreferences();

  return (
    <AuthGuard allowedRoles={['admin', 'customer']}>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.topNav}>
            <Link href={ROUTES.dashboard} className={styles.backLink}>
              ← Back to Dashboard
            </Link>
          </div>

          <Card variant="bordered" padding="lg" className={styles.card}>
            <div className={styles.header}>
              <div className={styles.badgeRow}>
                <span className={styles.elevenBadge}>🤖 Eleven AI Memory</span>
              </div>
              <h1 className={styles.title}>Garment Care Preferences</h1>
              <p className={styles.subtitle}>
                Eleven remembers your starch, folding, and delivery preferences forever — applied automatically on every order.
              </p>
            </div>

            {isLoading ? (
              <Loader text="Loading your saved preferences..." />
            ) : (
              <PreferencesForm initial={data?.preferences} />
            )}
          </Card>
        </div>
      </div>
    </AuthGuard>
  );
}
