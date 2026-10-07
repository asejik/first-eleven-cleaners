'use client';

import { useState, useMemo, useRef } from 'react';
import { useSubmitIntake } from '@/hooks/useIntake';
import { Button, Badge } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import { DRY_CLEAN_PRICES, WASH_FOLD_PRICE_PER_LB, WASH_FOLD_MINIMUM_LBS, catalogPriceLabel, type OrderStatusKey } from '@/lib/constants';
import { priceIntakeLine, quoteBandMaxCents } from '@/lib/intake-quote';
import type { Order } from '@/types';
import styles from '@/app/mission-control/intake/page.module.css';
import { prepareImageForUpload } from '@/lib/image-upload';

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
        if (item.service_type === 'alteration') return; // alterations have their own panel
        const matchingKey = Object.keys(DRY_CLEAN_PRICES).find(
          (k) => DRY_CLEAN_PRICES[k].label === item.garment_type
        ) || item.garment_type;
        counts[matchingKey] = (counts[matchingKey] || 0) + item.quantity;
      });
    }
    return counts;
  });
  const [intakeNotes, setIntakeNotes] = useState<string>(() => order.notes || '');
  // Staff quotes for "from" items (evening gown, wedding dress, drapes), as typed
  // (a re-intake keeps an earlier quote above the starting price)
  const [quotedPrices, setQuotedPrices] = useState<Record<string, string>>(() => {
    const quotes: Record<string, string> = {};
    (order.items || []).forEach((item) => {
      if (item.service_type === 'alteration') return;
      const key = Object.keys(DRY_CLEAN_PRICES).find((k) => DRY_CLEAN_PRICES[k].label === item.garment_type);
      const quoted = Number(item.quoted_unit_price) || Number(item.unit_price);
      if (key && DRY_CLEAN_PRICES[key].fromPrice && quoted > DRY_CLEAN_PRICES[key].price) {
        quotes[key] = quoted.toFixed(2);
      }
    });
    return quotes;
  });
  // Alterations booked with the order (kept as booked), and the confirmed price per piece for
  // "from" items, keyed by order item id (client 2026-10-06, Parts B-D)
  const alterationItems = useMemo(() => (order.items || []).filter((i) => i.service_type === 'alteration'), [order.items]);
  const [confirmedPrices, setConfirmedPrices] = useState<Record<string, string>>(() => {
    const prices: Record<string, string> = {};
    (order.items || []).forEach((item) => {
      if (item.service_type === 'alteration' && item.quoted_unit_price) prices[item.id] = Number(item.quoted_unit_price).toFixed(2);
    });
    return prices;
  });
  const customerPhotos = useMemo(() => (order.photos || []).filter((p) => p.photo_type === 'customer_reference'), [order.photos]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Existing driver pickup photos for reference
  const pickupPhotos = useMemo(() => {
    return (order.photos || []).filter((p) => p.photo_type === 'pickup_proof');
  }, [order.photos]);

  // Care preferences the customer saved (P05 AR-03), shown on the ticket
  const careNotes = useMemo(() => {
    const prefs = order.customer?.preferences;
    if (!prefs) return [];
    const notes: string[] = [];
    if (prefs.starch_level) notes.push(`Starch: ${prefs.starch_level}`);
    if (prefs.fold_vs_hang) notes.push(prefs.fold_vs_hang === 'fold' ? 'Fold shirts' : 'Hang shirts');
    if (prefs.detergent_sensitivity) notes.push(`Detergent: ${prefs.detergent_sensitivity}`);
    return notes;
  }, [order.customer?.preferences]);

  // Intake photos state: if viewing an order already processed, show its intake photos;
  // if order is in 'picked_up' queue awaiting initial intake, start with empty array.
  const [photos, setPhotos] = useState<Array<{ photo_url: string; preview_url?: string; condition_notes?: string }>>(() => {
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

    // Resize in the browser, then upload. The ticket only ever holds stored links (PR-06).
    try {
      const uploadFile = await prepareImageForUpload(file);
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('order_id', order.id);
      formData.append('photo_type', 'intake');

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await res.json().catch(() => ({}));
      if (!res.ok || !uploadData.url) {
        throw new Error(uploadData.error || 'The photo could not be uploaded. Please try again.');
      }
      setPhotos((prev) => [
        ...prev,
        { photo_url: uploadData.url, preview_url: uploadData.preview_url, condition_notes: 'Intake inspection proof' },
      ]);
      addToast({
        type: 'success',
        title: 'Photo Uploaded',
        message: 'Inspection photo saved to cloud storage.',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Photo Not Saved',
        message: (err as Error).message || 'The photo could not be uploaded. Please try again.',
      });
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
  // Same rule as the server: laundry is billed only when it was weighed (15 lb minimum then)
  const isWashFold = Number(weightLbs) > 0;
  const billedWeight = isWashFold ? Math.max(WASH_FOLD_MINIMUM_LBS, Number(weightLbs) || 0) : 0;
  const washFoldSubtotal = isWashFold ? billedWeight * WASH_FOLD_PRICE_PER_LB : 0;

  // Same line rules as the server (dozen pricing, intake quotes for "from" items)
  const quoteFor = (key: string): number | undefined => {
    const typed = (quotedPrices[key] || '').trim();
    return typed && DRY_CLEAN_PRICES[key]?.fromPrice ? Number(typed) : undefined;
  };
  // Quotes more than 25% above the from-price go to the customer for approval (not charged now)
  const linePrices = Object.keys(dryCleanCounts)
    .filter((key) => (dryCleanCounts[key] || 0) > 0)
    .map((key) => ({ key, line: priceIntakeLine(key, dryCleanCounts[key], quoteFor(key), { allowApproval: true }) }));
  const confirmedFor = (itemId: string): number | undefined => {
    const typed = (confirmedPrices[itemId] || '').trim();
    return typed ? Number(typed) : undefined;
  };
  const alterationPrices = alterationItems
    .filter((item) => !['approved', 'declined', 'returned'].includes(item.quote_status || ''))
    .map((item) => ({ item, line: priceIntakeLine(item.garment_type, item.quantity, confirmedFor(item.id), { allowApproval: true }) }));
  const quoteErrors = [...linePrices, ...alterationPrices].flatMap(({ line }) => (line.ok ? [] : [line.error]));
  const dryCleanSubtotal = linePrices.reduce((acc, { line }) => acc + (line.ok ? line.subtotal : 0), 0);
  const alterationSubtotal = alterationPrices.reduce((acc, { line }) => acc + (line.ok ? line.subtotal : 0), 0);
  const awaitingCount = [...linePrices, ...alterationPrices].filter(({ line }) => line.ok && line.awaitingApproval).length;

  const subtotal = washFoldSubtotal + dryCleanSubtotal + alterationSubtotal;
  const discount = order.discount_amount || 0;
  const total = Math.max(0, subtotal - discount);

  const isAlreadyFinalized =
    order.status === 'in_cleaning' ||
    order.status === 'out_for_delivery' ||
    order.status === 'delivered';

  const handleFinalizeIntake = async () => {
    if (isAlreadyFinalized || quoteErrors.length > 0) return;

    const dryCleanItemsArray = Object.keys(dryCleanCounts)
      .filter((k) => dryCleanCounts[k] > 0)
      .map((k) => ({
        garment_type: k,
        quantity: dryCleanCounts[k],
        ...(quoteFor(k) !== undefined ? { quoted_unit_price: quoteFor(k) } : {}),
      }));

    try {
      const res = await submitIntake.mutateAsync({
        order_id: order.id,
        weight_lbs: weightLbs,
        dry_clean_items: dryCleanItemsArray,
        alteration_lines: alterationItems.map((item) => ({
          item_id: item.id,
          ...(confirmedFor(item.id) !== undefined ? { confirmed_unit_price: confirmedFor(item.id) } : {}),
        })),
        photos: photos,
        advance_to_cleaning: false,
        intake_notes: intakeNotes,
      });

      onIntakeCompleted(res.status);

      if (res.payment_status === 'failed' || res.payment_failed) {
        addToast({
          type: 'warning',
          title: '⚠️ Payment Needed',
          message: `Order #${order.order_number || order.id.slice(0, 8)} weighed & itemized ($${total.toFixed(2)}), but the card was declined. Cleaning can go ahead; delivery waits until it's paid.`,
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
      {/* Payment Needed Alert Banner */}
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
            <strong>PAYMENT NEEDED:</strong> The card was declined for ${(Number(order.amount_due) > 0 ? Number(order.amount_due) : order.total || total).toFixed(2)}. Cleaning can go ahead; delivery waits until it&apos;s paid (Mission Control &gt; Payment Needed).
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
          {careNotes.length > 0 && (
            <p className={styles.careNotes}>
              <strong>Customer care preferences:</strong> {careNotes.join(' • ')}
            </p>
          )}
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
          <span>👔</span> Dry Clean &amp; Household Line-Item Counter
        </h3>

        <div className={styles.itemsGrid}>
          {Object.keys(DRY_CLEAN_PRICES).filter((key) => DRY_CLEAN_PRICES[key].category !== 'alteration').map((key) => {
            const item = DRY_CLEAN_PRICES[key];
            const qty = dryCleanCounts[key] || 0;
            const awaiting = linePrices.find((l) => l.key === key)?.line;
            return (
              <div key={key} className={styles.itemCounterCard}>
                <div>
                  <span className={styles.itemLabel}>{item.label}</span>
                  <span className={styles.itemPrice}>
                    {catalogPriceLabel(item)} / ea{item.dozenPrice ? ` · $${item.dozenPrice.toFixed(2)} / dozen` : ''}
                  </span>
                </div>
                {item.fromPrice && qty > 0 && (
                  <label className={styles.itemPrice} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Quoted price each $
                    <input
                      type="number"
                      inputMode="decimal"
                      min={item.price}
                      step="0.01"
                      placeholder={item.price.toFixed(2)}
                      value={quotedPrices[key] || ''}
                      onChange={(e) => setQuotedPrices((prev) => ({ ...prev, [key]: e.target.value }))}
                      aria-label={`Quoted price for each ${item.label}`}
                      style={{ width: '90px' }}
                    />
                    {awaiting?.ok && awaiting.awaitingApproval && <span>needs the customer&apos;s OK</span>}
                  </label>
                )}
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

      {/* Alterations booked with the order (client 2026-10-06, Parts B-D) */}
      {alterationItems.length > 0 && (
        <div className={styles.sectionCard}>
          <h3 className={styles.sectionTitle}>
            <span>🧵</span> Alterations ({alterationItems.length})
          </h3>
          <p className={styles.itemPrice} style={{ margin: '0 0 8px' }}>
            📸 Photograph the pins, or the garment tagged MATCH, for the Garment Passport. &quot;From&quot; items: enter the
            confirmed price. Up to 25% above the listed price is charged now; anything higher is sent to the customer to
            approve and isn&apos;t charged until they do.
          </p>
          {alterationItems.map((item) => {
            const meta = DRY_CLEAN_PRICES[item.garment_type];
            const decided = ['approved', 'declined', 'returned'].includes(item.quote_status || '');
            const priced = alterationPrices.find((p) => p.item.id === item.id)?.line;
            const bandMax = meta?.fromPrice ? quoteBandMaxCents(meta.price) / 100 : null;
            return (
              <div key={item.id} className={styles.itemCounterCard} style={{ alignItems: 'flex-start' }}>
                <div>
                  <span className={styles.itemLabel}>
                    {item.quantity > 1 ? `${item.quantity}x ` : ''}
                    {meta?.label || item.garment_type}
                  </span>
                  <span className={styles.itemPrice}>{item.notes}</span>
                  {decided && <span className={styles.itemPrice}>Customer decision: {item.quote_status}</span>}
                </div>
                {meta?.fromPrice && !decided ? (
                  <label className={styles.itemPrice} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    Confirmed price each $
                    <input
                      type="number"
                      inputMode="decimal"
                      min={meta.price}
                      step="0.01"
                      placeholder={meta.price.toFixed(2)}
                      value={confirmedPrices[item.id] || ''}
                      onChange={(e) => setConfirmedPrices((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      aria-label={`Confirmed price for each ${meta.label}`}
                      style={{ width: '90px' }}
                    />
                    <span>
                      {priced?.ok && priced.awaitingApproval
                        ? "needs the customer's OK"
                        : `charged now (up to $${bandMax?.toFixed(2)})`}
                    </span>
                  </label>
                ) : (
                  <span className={styles.itemPrice}>${Number(item.subtotal || 0).toFixed(2)}</span>
                )}
              </div>
            );
          })}
          {customerPhotos.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              {customerPhotos.map((photo) => (
                <button key={photo.id} type="button" onClick={() => onZoomPhoto(photo.photo_url)} style={{ background: 'none', border: '1px solid #334155', borderRadius: '6px', padding: '4px 8px', color: '#cbd5e1', cursor: 'pointer' }}>
                  Customer photo: {photo.condition_notes || 'repair'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
                  src={p.preview_url || p.photo_url}
                  alt={`Intake ${idx + 1}`}
                  onClick={() => onZoomPhoto(p.preview_url || p.photo_url)}
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
          {awaitingCount > 0 && (
            <span className={styles.discountPill}>
              {awaitingCount} quoted item{awaitingCount > 1 ? 's' : ''} sent for the customer&apos;s OK: not charged now
            </span>
          )}
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
          {quoteErrors.map((err) => (
            <span key={err} role="alert" style={{ fontSize: 'var(--text-xs)', color: '#fca5a5' }}>
              {err}
            </span>
          ))}
          <Button
            variant="primary"
            size="lg"
            onClick={handleFinalizeIntake}
            isLoading={submitIntake.isPending}
            disabled={submitIntake.isPending || isAlreadyFinalized || quoteErrors.length > 0}
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
