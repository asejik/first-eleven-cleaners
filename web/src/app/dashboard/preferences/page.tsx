'use client';

import { useState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button, Input, Card, Loader } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import { useCustomerPreferences, useUpdatePreferences } from '@/hooks/usePreferences';
import { ROUTES } from '@/lib/constants';
import styles from './page.module.css';

export default function PreferencesPage() {
  const { data, isLoading } = useCustomerPreferences();
  const updatePreferencesMutation = useUpdatePreferences();
  const addToast = useUIStore((s) => s.addToast);

  const initial = data?.preferences;

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

  // Populate from Supabase when loaded
  useEffect(() => {
    if (data?.preferences) {
      const p = data.preferences;
      if (p.starch_level) setStarchLevel(p.starch_level);
      if (p.fold_vs_hang) setFoldVsHang(p.fold_vs_hang);
      setDetergentSensitivity(p.detergent_sensitivity || '');
      setGateCode(p.gate_code || '');
      setDeliveryInstructions(p.delivery_instructions || '');
      setSpecialNotes(p.special_notes || '');
    }
  }, [data?.preferences]);

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

            <form onSubmit={handleSave} className={styles.form}>
              {/* Starch Level */}
              <div className={styles.fieldGroup}>
                <label className={styles.groupLabel}>Shirt Starch Level</label>
                <div className={styles.optionsGrid}>
                  {(['none', 'light', 'medium', 'heavy'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      className={`${styles.optionCard} ${starchLevel === level ? styles.selectedOption : ''}`}
                      onClick={() => setStarchLevel(level)}
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
                <label className={styles.groupLabel}>Default Finishing Style</label>
                <div className={styles.optionsGridTwo}>
                  <button
                    type="button"
                    className={`${styles.optionCard} ${foldVsHang === 'hang' ? styles.selectedOption : ''}`}
                    onClick={() => setFoldVsHang('hang')}
                  >
                    <span className={styles.optionIcon}>👔</span>
                    <span className={styles.optionTitle}>On Hangers</span>
                    <span className={styles.optionDesc}>Protected in garment bags, closet-ready</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.optionCard} ${foldVsHang === 'fold' ? styles.selectedOption : ''}`}
                    onClick={() => setFoldVsHang('fold')}
                  >
                    <span className={styles.optionIcon}>🧺</span>
                    <span className={styles.optionTitle}>Neatly Folded</span>
                    <span className={styles.optionDesc}>Drawer-ready, stacked in bundle packs</span>
                  </button>
                </div>
              </div>

              {/* Detergent & Sensitivities */}
              <Input
                label="Detergent & Fabric Sensitivities"
                value={detergentSensitivity}
                onChange={(e) => setDetergentSensitivity(e.target.value)}
                placeholder="e.g. Free & Clear, no scents, hypoallergenic"
                helperText="We stock premium hypoallergenic solutions for sensitive skin"
              />

              {/* Gate Code */}
              <Input
                label="Gate Code / Building Entry"
                value={gateCode}
                onChange={(e) => setGateCode(e.target.value)}
                placeholder="e.g. Gate #1234, Call box code"
              />

              {/* Delivery Instructions */}
              <Input
                label="Porch / Concierge Delivery Notes"
                value={deliveryInstructions}
                onChange={(e) => setDeliveryInstructions(e.target.value)}
                placeholder="e.g. Leave inside screened porch"
              />

              {/* Special Instructions */}
              <div className={styles.textareaGroup}>
                <label htmlFor="specialNotes">Special Garment Notes for Eleven</label>
                <textarea
                  id="specialNotes"
                  rows={3}
                  value={specialNotes}
                  onChange={(e) => setSpecialNotes(e.target.value)}
                  className={styles.textarea}
                  placeholder="e.g. Always check trouser hems, treat cuffs with extra stain focus..."
                />
              </div>

              <Button type="submit" variant="primary" size="lg" isLoading={updatePreferencesMutation.isPending}>
                Save Preferences to Eleven
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </AuthGuard>
  );
}
