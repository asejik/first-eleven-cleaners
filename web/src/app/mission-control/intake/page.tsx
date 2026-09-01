'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useIntakeQueue, useSubmitIntake } from '@/hooks/useIntake';
import { Button, Badge, Loader, Modal } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import { DRY_CLEAN_PRICES, WASH_FOLD_PRICE_PER_LB, WASH_FOLD_MINIMUM_LBS, ROUTES } from '@/lib/constants';
import type { Order } from '@/types';
import styles from './page.module.css';

export default function CentralIntakePage() {
  const { data, isLoading } = useIntakeQueue();
  const submitIntake = useSubmitIntake();
  const addToast = useUIStore((s) => s.addToast);

  const queue = data?.queue || [];
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Form State
  const [weightLbs, setWeightLbs] = useState<number>(0);
  const [dryCleanCounts, setDryCleanCounts] = useState<Record<string, number>>({});
  const [intakeNotes, setIntakeNotes] = useState<string>('');
  const [photos, setPhotos] = useState<Array<{ photo_url: string; condition_notes?: string }>>([]);
  const [advanceToCleaning, setAdvanceToCleaning] = useState(true);

  // Expanded Zoom Photo Modal
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null);

  // Auto-select first order when loaded
  useEffect(() => {
    if (queue.length > 0 && !selectedOrder) {
      handleSelectOrder(queue[0]);
    }
  }, [queue, selectedOrder]);

  const handleSelectOrder = (order: Order) => {
    setSelectedOrder(order);
    setWeightLbs(order.weight_lbs || (order.order_type === 'dry_clean' ? 0 : 15));
    setIntakeNotes(order.notes || '');

    // Seed existing dry clean counts if any
    const counts: Record<string, number> = {};
    if (order.items && order.items.length > 0) {
      order.items.forEach((item) => {
        const matchingKey = Object.keys(DRY_CLEAN_PRICES).find(
          (k) => DRY_CLEAN_PRICES[k].label === item.garment_type
        ) || item.garment_type;
        counts[matchingKey] = (counts[matchingKey] || 0) + item.quantity;
      });
    }
    setDryCleanCounts(counts);

    // Seed existing photos if any
    if (order.photos && order.photos.length > 0) {
      setPhotos(order.photos.map((p) => ({ photo_url: p.photo_url, condition_notes: p.condition_notes || '' })));
    } else {
      setPhotos([]);
    }
  };

  const handleCounterChange = (key: string, delta: number) => {
    setDryCleanCounts((prev) => {
      const current = prev[key] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [key]: next };
    });
  };

  const handleAddSamplePhoto = () => {
    const sampleUrls = [
      'https://images.unsplash.com/photo-1545173168-9f1947eebb7f?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?auto=format&fit=crop&q=80&w=600',
    ];
    const nextUrl = sampleUrls[photos.length % sampleUrls.length];
    setPhotos([...photos, { photo_url: nextUrl, condition_notes: 'Intake tag verified' }]);
  };

  const handlePhotoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotos([...photos, { photo_url: reader.result as string, condition_notes: 'Uploaded intake proof' }]);
      };
      reader.readAsDataURL(file);
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
  const isWashFold = selectedOrder?.order_type === 'wash_fold' || selectedOrder?.order_type === 'mixed' || weightLbs > 0;
  const billedWeight = isWashFold ? Math.max(WASH_FOLD_MINIMUM_LBS, Number(weightLbs) || 0) : 0;
  const washFoldSubtotal = isWashFold ? billedWeight * WASH_FOLD_PRICE_PER_LB : 0;

  const dryCleanSubtotal = Object.keys(dryCleanCounts).reduce((acc, key) => {
    const qty = dryCleanCounts[key] || 0;
    const price = DRY_CLEAN_PRICES[key]?.price || 8.97;
    return acc + qty * price;
  }, 0);

  const subtotal = washFoldSubtotal + dryCleanSubtotal;
  const discount = selectedOrder?.discount_amount || 0;
  const total = Math.max(0, subtotal - discount);

  const isAlreadyFinalized = Boolean(
    selectedOrder &&
      (selectedOrder.status === 'in_cleaning' ||
        selectedOrder.status === 'out_for_delivery' ||
        selectedOrder.status === 'delivered')
  );

  const handleFinalizeIntake = async () => {
    if (!selectedOrder || isAlreadyFinalized) return;

    const dryCleanItemsArray = Object.keys(dryCleanCounts)
      .filter((k) => dryCleanCounts[k] > 0)
      .map((k) => ({
        garment_type: k,
        quantity: dryCleanCounts[k],
      }));

    try {
      const res = await submitIntake.mutateAsync({
        order_id: selectedOrder.id,
        weight_lbs: weightLbs,
        dry_clean_items: dryCleanItemsArray,
        photos: photos.length > 0 ? photos : [{ photo_url: 'https://images.unsplash.com/photo-1545173168-9f1947eebb7f?auto=format&fit=crop&q=80&w=600', condition_notes: 'Intake tag check' }],
        advance_to_cleaning: advanceToCleaning,
        intake_notes: intakeNotes,
      });

      setSelectedOrder((prev) => (prev ? { ...prev, status: res.status } : null));

      addToast({
        type: 'success',
        title: advanceToCleaning ? 'Intake Finalized & Moved to Cleaning' : 'Itemized Ticket Saved',
        message: `Order #${selectedOrder.order_number || selectedOrder.id.slice(0, 8)} itemized ($${total.toFixed(2)}) & Garment Passport record updated.`,
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Intake Error',
        message: (err as Error).message,
      });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.headerRow}>
          <div className={styles.brandArea}>
            <Image
              src="/icon.png"
              alt="First Eleven"
              width={42}
              height={42}
              style={{ borderRadius: '8px', objectFit: 'cover' }}
            />
            <div>
              <h1 className={styles.title}>Central Intake Station</h1>
              <p className={styles.subtitle}>Digital Weighing, Garment Passport Itemization & Photo Verification</p>
            </div>
          </div>
          <div className={styles.navLinks}>
            <Link href="/mission-control">
              <Button variant="outlineLight" size="sm">
                ← Mission Control Ops
              </Button>
            </Link>
            <Link href={ROUTES.dashboard}>
              <Button variant="ghostLight" size="sm">
                Customer View
              </Button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <Loader text="Loading plant intake queue..." />
        ) : (
          <div className={styles.workspaceGrid}>
            {/* Left Queue Column */}
            <div className={styles.queueCol}>
              <div className={styles.queueHeader}>
                <span>Incoming Bags Queue</span>
                <Badge variant="warning">{queue.length} Ready</Badge>
              </div>

              <div className={styles.queueList}>
                {queue.length === 0 ? (
                  <p style={{ fontSize: 'var(--text-xs)', color: '#cbd5e1' }}>
                    No incoming bags currently in queue.
                  </p>
                ) : (
                  queue.map((order) => {
                    const isSelected = selectedOrder?.id === order.id;
                    const orderNum = order.order_number || order.id.slice(0, 8);
                    return (
                      <button
                        key={order.id}
                        type="button"
                        className={`${styles.queueCard} ${isSelected ? styles.queueCardActive : ''}`}
                        onClick={() => handleSelectOrder(order)}
                      >
                        <span className={styles.queueCardNum}>#{orderNum}</span>
                        <span className={styles.queueCustomer}>{order.customer?.full_name || 'Customer'}</span>
                        <span className={styles.queueMeta}>
                          {order.order_type.toUpperCase()} • {order.pickup_date}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Active Workspace Column */}
            {selectedOrder ? (
              <div className={styles.formCol}>
                {/* Active Bag Summary */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '16px 20px', borderRadius: 'var(--radius-xl)', border: '1px solid #334155' }}>
                  <div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)', fontWeight: 'bold' }}>
                      INSPECTION IN PROGRESS
                    </span>
                    <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'bold', margin: '2px 0 0', color: '#ffffff' }}>
                      Order #{selectedOrder.order_number || selectedOrder.id.slice(0, 8)} — {selectedOrder.customer?.full_name}
                    </h2>
                  </div>
                  <Badge variant={selectedOrder.status === 'booked' ? 'booked' : 'cleaning'}>
                    {selectedOrder.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>

                {/* Digital Scale Section */}
                <div className={styles.sectionCard}>
                  <h3 className={styles.sectionTitle}>
                    <span>⚖️</span> Digital Scale Wash & Fold Weight
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
                  <h3 className={styles.sectionTitle}>
                    <span>📸</span> Garment Passport Photo Inspection ({photos.length})
                  </h3>

                  <div className={styles.photoUploaderArea}>
                    <p style={{ fontSize: 'var(--text-xs)', color: '#cbd5e1', margin: 0 }}>
                      Capture high-resolution intake proof. Click any thumbnail to expand, or click the red ✕ to remove.
                    </p>

                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoFileUpload}
                        style={{ display: 'none' }}
                        id="intakePhotoUpload"
                      />
                      <label htmlFor="intakePhotoUpload" style={{ cursor: 'pointer' }}>
                        <Button variant="outlineLight" size="sm" type="button">
                          📷 Capture with Camera
                        </Button>
                      </label>
                      <Button variant="ghostLight" size="sm" type="button" onClick={handleAddSamplePhoto}>
                        + Add Verified Demo Photo
                      </Button>
                    </div>

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
                              onClick={() => setZoomPhotoUrl(p.photo_url)}
                              style={{ cursor: 'pointer' }}
                              title="Click to view full photo"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <div>
                      <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                        Intake Condition & Stain Notes
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
                </div>

                {/* Finalize Bar */}
                <div className={styles.finalizeBar}>
                  <div className={styles.totalsCol}>
                    <span style={{ fontSize: 'var(--text-xs)', color: '#94a3b8' }}>ITEMIZED INTAKE TOTAL:</span>
                    <span className={styles.subtotalText}>${total.toFixed(2)}</span>
                    {discount > 0 && <span className={styles.discountPill}>Promo Discount: -${discount.toFixed(2)} applied</span>}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                    {!isAlreadyFinalized && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', color: '#f1f5f9', cursor: 'pointer', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={advanceToCleaning}
                          onChange={(e) => setAdvanceToCleaning(e.target.checked)}
                        />
                        <span>Advance immediately to &ldquo;In Cleaning&rdquo; plant line</span>
                      </label>
                    )}

                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleFinalizeIntake}
                      isLoading={submitIntake.isPending}
                      disabled={submitIntake.isPending || isAlreadyFinalized}
                    >
                      {isAlreadyFinalized
                        ? '✓ Intake Completed & Customer Notified'
                        : advanceToCleaning
                        ? '✓ Finalize Intake & Move to Cleaning Line (Message 3)'
                        : '✓ Save Itemized Ticket & Stage Intake (Message 3)'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '60px', textAlign: 'center', background: '#1e293b', borderRadius: 'var(--radius-2xl)', color: '#cbd5e1' }}>
                Select an order from the queue on the left to begin intake check.
              </div>
            )}
          </div>
        )}

        {/* Lightbox Zoom Modal */}
        <Modal
          isOpen={Boolean(zoomPhotoUrl)}
          onClose={() => setZoomPhotoUrl(null)}
          title="📸 High-Resolution Intake Photo"
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            {zoomPhotoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={zoomPhotoUrl}
                alt="Full intake preview"
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 'var(--radius-lg)' }}
              />
            )}
            <Button variant="primary" size="sm" onClick={() => setZoomPhotoUrl(null)}>
              Close Photo
            </Button>
          </div>
        </Modal>
      </div>
    </div>
  );
}
