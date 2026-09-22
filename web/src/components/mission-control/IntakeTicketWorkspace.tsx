'use client';

import { useState, useMemo, useRef } from 'react';
import { useSubmitIntake } from '@/hooks/useIntake';
import { Button, Badge } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import { DRY_CLEAN_PRICES, WASH_FOLD_PRICE_PER_LB, WASH_FOLD_MINIMUM_LBS, type OrderStatusKey } from '@/lib/constants';
import type { Order } from '@/types';
import styles from '@/app/mission-control/intake/page.module.css';

export interface IntakeTicketWorkspaceProps {
  order: Order;
  onIntakeCompleted: (newStatus: OrderStatusKey) => void;
  onZoomPhoto: (url: string) => void;
}

export function IntakeTicketWorkspace({ order, onIntakeCompleted, onZoomPhoto }: IntakeTicketWorkspaceProps) {
  const submitIntake = useSubmitIntake();
  const addToast = useUIStore((s) => s.addToast);

  // Initialize form state directly from order props
  const [weightLbs, setWeightLbs] = useState<number>(() => order.weight_lbs || (order.order_type === 'dry_clean' ? 0 : 15));
  const [dryCleanCounts, setDryCleanCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    if (order.items && order.items.length > 0) {
      order.items.forEach((item) => {
        const matchingKey = Object.keys(DRY_CLEAN_PRICES).find(
          (k) => DRY_CLEAN_PRICES[k].label === item.garment_type
        ) || item.garment_type;
        counts[matchingKey] = (counts[matchingKey] || 0) + item.quantity;
      });
    }
    return counts;
  });
  const [intakeNotes, setIntakeNotes] = useState<string>(() => order.notes || '');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Existing driver pickup photos for reference
  const pickupPhotos = useMemo(() => {
    return (order.photos || []).filter((p) => p.photo_type === 'pickup_proof');
  }, [order.photos]);

  // Intake photos state: if viewing an order already processed, show its intake photos;
  // if order is in 'picked_up' queue awaiting initial intake, start with empty array.
  const [photos, setPhotos] = useState<Array<{ photo_url: string; condition_notes?: string }>>(() => {
    if (order.status !== 'picked_up' && order.photos && order.photos.length > 0) {
      return order.photos
        .filter((p) => p.photo_type === 'intake')
        .map((p) => ({ photo_url: p.photo_url, condition_notes: p.condition_notes || '' }));
    }
    return [];
  });

  const handleCounterChange = (key: string, delta: number) => {
    setDryCleanCounts((prev) => {
      const current = prev[key] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [key]: next };
    });
  };

  const handlePhotoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so re-capturing or re-selecting same file triggers onChange
    e.target.value = '';

    setIsUploadingPhoto(true);

    // Direct CDN upload
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('order_id', order.id);
      formData.append('photo_type', 'intake');

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await res.json();
      if (res.ok && uploadData.url) {
        setPhotos((prev) => [
          ...prev,
          { photo_url: uploadData.url, condition_notes: 'Intake inspection proof' },
        ]);
        addToast({
          type: 'success',
          title: 'Photo Uploaded',
          message: 'Inspection photo saved to cloud storage.',
        });
      } else {
        // Local preview fallback
        const reader = new FileReader();
        reader.onloadend = () => {
          setPhotos((prev) => [
            ...prev,
            { photo_url: reader.result as string, condition_notes: 'Uploaded intake proof' },
          ]);
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.warn('Direct upload failed, fallback to local preview:', err);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotos((prev) => [
          ...prev,
          { photo_url: reader.result as string, condition_notes: 'Uploaded intake proof' },
        ]);
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = (indexToRemove: number) => {
    setPhotos((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    addToast({
      type: 'info',
      title: 'Photo Removed',
      message: 'Inspection photo removed from intake ticket.',
    });
  };

  // Calculations
  const isWashFold = order.order_type === 'wash_fold' || order.order_type === 'mixed' || weightLbs > 0;
  const billedWeight = isWashFold ? Math.max(WASH_FOLD_MINIMUM_LBS, Number(weightLbs) || 0) : 0;
  const washFoldSubtotal = isWashFold ? billedWeight * WASH_FOLD_PRICE_PER_LB : 0;

  const dryCleanSubtotal = Object.keys(dryCleanCounts).reduce((acc, key) => {
    const qty = dryCleanCounts[key] || 0;
    const price = DRY_CLEAN_PRICES[key]?.price || 8.99;
    return acc + qty * price;
  }, 0);

  const subtotal = washFoldSubtotal + dryCleanSubtotal;
  const discount = order.discount_amount || 0;
  const total = Math.max(0, subtotal - discount);

  const isAlreadyFinalized =
    order.status === 'in_cleaning' ||
    order.status === 'out_for_delivery' ||
    order.status === 'delivered';

  const handleFinalizeIntake = async () => {
    if (isAlreadyFinalized) return;

    const dryCleanItemsArray = Object.keys(dryCleanCounts)
      .filter((k) => dryCleanCounts[k] > 0)
      .map((k) => ({
        garment_type: k,
        quantity: dryCleanCounts[k],
      }));

    try {
      const res = await submitIntake.mutateAsync({
        order_id: order.id,
        weight_lbs: weightLbs,
        dry_clean_items: dryCleanItemsArray,
        photos: photos,
        advance_to_cleaning: false,
        intake_notes: intakeNotes,
      });

      onIntakeCompleted(res.status);

      if (res.payment_status === 'failed' || res.payment_failed) {
        addToast({
          type: 'warning',
          title: '⚠️ Payment Declined — On Hold',
          message: `Order #${order.order_number || order.id.slice(0, 8)} weighed & itemized ($${total.toFixed(2)}), but card authorization failed. Order placed on Payment Hold.`,
        });
      } else {
        addToast({
          type: 'success',
          title: 'Intake & Payment Completed',
          message: `Order #${order.order_number || order.id.slice(0, 8)} weighed & itemized ($${total.toFixed(2)}). Card on file successfully charged.`,
        });
      }
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Intake Error',
        message: (err as Error).message,
      });
    }
  };

  return (
    <div className={styles.formCol}>
      {/* Payment Hold Alert Banner */}
      {order.payment_status === 'failed' && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px 16px',
          color: '#fca5a5',
          fontSize: 'var(--text-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '12px'
        }}>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <div>
            <strong>PAYMENT HOLD:</strong> Automatic card authorization failed for ${(order.total || total).toFixed(2)}. Garments cannot enter eco-cleaning until card is updated or Manager Override is authorized.
          </div>
        </div>
      )}

      {/* Active Bag Summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '16px 20px', borderRadius: 'var(--radius-xl)', border: '1px solid #334155' }}>
        <div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)', fontWeight: 'bold' }}>
            {order.status === 'picked_up' ? 'INSPECTION IN PROGRESS' : 'INTAKE RECORD ARCHIVE'}
          </span>
          <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'bold', margin: '2px 0 0', color: '#ffffff' }}>
            Order #{order.order_number || order.id.slice(0, 8)} — {order.customer?.full_name}
          </h2>
          {order.updated_at && (
            <span style={{ fontSize: 'var(--text-xs)', color: '#94a3b8', display: 'block', marginTop: '3px' }}>
              ⏱️ Recorded: {new Date(order.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(order.updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
            </span>
          )}
        </div>
        <Badge variant={order.status === 'picked_up' ? 'picked_up' : order.status === 'delivered' ? 'delivered' : 'weighed'}>
          {order.status.replace('_', ' ').toUpperCase()}
        </Badge>
      </div>

      {/* Digital Scale Section */}
      <div className={styles.sectionCard}>
        <h3 className={styles.sectionTitle}>
          <span>⚖️</span> Digital Scale Wash &amp; Fold Weight
        </h3>

        <div className={styles.scaleBox}>
          <input
            type="number"
            step="0.5"
            min="0"
            value={weightLbs || ''}
            onChange={(e) => setWeightLbs(Number(e.target.value))}
            className={styles.scaleInput}
            placeholder="0.0"
          />
          <div className={styles.scaleInfo}>
            <span className={styles.scalePrice}>
              {billedWeight} lbs billed @ ${WASH_FOLD_PRICE_PER_LB.toFixed(2)}/lb = ${washFoldSubtotal.toFixed(2)}
            </span>
            <span className={styles.scaleFloorNote}>
              *15-lb ($45.00) minimum published floor applied automatically.
            </span>
          </div>
        </div>
      </div>

      {/* Dry Cleaning Itemizer */}
      <div className={styles.sectionCard}>
        <h3 className={styles.sectionTitle}>
          <span>👔</span> Dry Clean Line-Item Counter
        </h3>

        <div className={styles.itemsGrid}>
          {Object.keys(DRY_CLEAN_PRICES).map((key) => {
            const item = DRY_CLEAN_PRICES[key];
            const qty = dryCleanCounts[key] || 0;
            return (
              <div key={key} className={styles.itemCounterCard}>
                <div>
                  <span className={styles.itemLabel}>{item.label}</span>
                  <span className={styles.itemPrice}>${item.price.toFixed(2)} / ea</span>
                </div>
                <div className={styles.counterActions}>
                  <button
                    type="button"
                    className={styles.counterBtn}
                    onClick={() => handleCounterChange(key, -1)}
                  >
                    -
                  </button>
                  <span className={styles.qtyDisplay}>{qty}</span>
                  <button
                    type="button"
                    className={styles.counterBtn}
                    onClick={() => handleCounterChange(key, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Garment Passport Multi-Angle Photos */}
      <div className={styles.sectionCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
              <span>📸</span> Garment Passport Photo Inspection ({photos.length})
            </h3>
            <p style={{ fontSize: 'var(--text-xs)', color: '#cbd5e1', margin: '4px 0 0' }}>
              Optional — capture or upload photos if documenting pre-existing stains, damage, or luxury items.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoFileUpload}
              style={{ display: 'none' }}
              id="intakeCameraInput"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/*"
              onChange={handlePhotoFileUpload}
              style={{ display: 'none' }}
              id="intakeFileInput"
            />

            <Button
              variant="outlineLight"
              size="sm"
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isUploadingPhoto}
            >
              📷 {isUploadingPhoto ? 'Uploading...' : 'Capture with Camera'}
            </Button>

            <Button
              variant="outlineLight"
              size="sm"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingPhoto}
            >
              📁 Upload Photo
            </Button>
          </div>
        </div>

        {/* Driver Doorstep Pickup Proof (Reference Only) */}
        {pickupPhotos.length > 0 && (
          <div style={{ marginTop: 'var(--space-3)', padding: '10px 14px', background: '#0f172a', borderRadius: 'var(--radius-md)', border: '1px solid #334155' }}>
            <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
              🚪 Driver Doorstep Pickup Proof (Reference Only)
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {pickupPhotos.map((p, idx) => (
                <div key={idx} className={styles.photoPreviewBox} style={{ border: '1px solid #38bdf8' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.photo_url}
                    alt={`Pickup Proof ${idx + 1}`}
                    onClick={() => onZoomPhoto(p.photo_url)}
                    style={{ cursor: 'pointer' }}
                    title="Click to view driver doorstep proof"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {photos.length > 0 && (
          <div className={styles.photoPreviewGrid}>
            {photos.map((p, idx) => (
              <div key={idx} className={styles.photoPreviewBox}>
                <button
                  type="button"
                  className={styles.removePhotoBtn}
                  onClick={() => handleRemovePhoto(idx)}
                  title="Remove this photo"
                >
                  ✕
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.photo_url}
                  alt={`Intake ${idx + 1}`}
                  onClick={() => onZoomPhoto(p.photo_url)}
                  style={{ cursor: 'pointer' }}
                  title="Click to view full photo"
                />
              </div>
            ))}
          </div>
        )}

        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
            Intake Condition &amp; Stain Notes
          </label>
          <input
            type="text"
            value={intakeNotes}
            onChange={(e) => setIntakeNotes(e.target.value)}
            placeholder="e.g. Light coffee spot on right cuff treated with enzyme pre-wash."
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid #334155',
              background: '#0f172a',
              color: '#ffffff',
              fontSize: 'var(--text-sm)',
            }}
          />
        </div>
      </div>

      {/* Finalize Bar */}
      <div className={styles.finalizeBar}>
        <div className={styles.totalsCol}>
          <span style={{ fontSize: 'var(--text-xs)', color: '#94a3b8' }}>ITEMIZED INTAKE TOTAL:</span>
          <span className={styles.subtotalText}>${total.toFixed(2)}</span>
          {discount > 0 && <span className={styles.discountPill}>Promo Discount: -${discount.toFixed(2)} applied</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>
              💳 Card on File: Vaulted
            </span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              • Auto-charge of ${total.toFixed(2)} will settle upon finalize
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <Button
            variant="primary"
            size="lg"
            onClick={handleFinalizeIntake}
            isLoading={submitIntake.isPending}
            disabled={submitIntake.isPending || isAlreadyFinalized}
          >
            {isAlreadyFinalized
              ? '✓ Intake Completed & Payment Settled'
              : '⚡ Finalize Intake & Charge Card on File'}
          </Button>
        </div>
      </div>
    </div>
  );
}
