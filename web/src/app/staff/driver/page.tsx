'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useDriverManifest, useDriverAction } from '@/hooks/useDriver';
import { Button, Loader, Modal, RefreshButton } from '@/components/ui';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useUIStore } from '@/stores/ui-store';
import { ROUTES } from '@/lib/constants';
import { DriverStopCard } from '@/components/driver';
import styles from './page.module.css';

export default function DriverPage() {
  const [shift, setShift] = useState<string>('all');
  const [viewFilter, setViewFilter] = useState<'all' | 'pickups' | 'deliveries'>('all');
  const [pickupTab, setPickupTab] = useState<'to_pickup' | 'in_van' | 'picked_up'>('to_pickup');
  const [deliveryTab, setDeliveryTab] = useState<'to_deliver' | 'delivered'>('to_deliver');
  
  const { data, isLoading, refetch } = useDriverManifest(shift);
  const driverAction = useDriverAction();
  const addToast = useUIStore((s) => s.addToast);

  // Photo modal state
  const [selectedOrder, setSelectedOrder] = useState<{ id: string; number: string; type: 'pickup' | 'delivery' } | null>(null);
  const [photoNote, setPhotoNote] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Expanded Zoom Photo Modal
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null);

  const pickups = data?.pickups || [];
  const inVan = data?.picked_up_history || [];
  const pickedUpCompleted = data?.picked_up_completed || [];
  const readyAtPlant = data?.ready_at_plant || [];
  const deliveries = data?.deliveries || [];
  const delivered = data?.completed || [];

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExecuteAction = async () => {
    if (!selectedOrder) return;

    if (!photoPreview) {
      addToast({
        type: 'error',
        title: 'Photo Required',
        message: 'A photo snapshot is strictly required to confirm this stop.',
      });
      return;
    }

    try {
      let finalPhotoUrl = photoPreview;
      if (photoFile) {
        setIsUploading(true);
        try {
          const formData = new FormData();
          formData.append('file', photoFile);
          formData.append('order_id', selectedOrder.id);
          formData.append('photo_type', selectedOrder.type === 'pickup' ? 'pickup_proof' : 'delivery_proof');

          const uploadRes = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });
          const uploadData = await uploadRes.json();
          if (uploadRes.ok && uploadData.url) {
            finalPhotoUrl = uploadData.url;
          }
        } catch (uploadErr) {
          console.warn('Direct upload failed, falling back to server resolution:', uploadErr);
        } finally {
          setIsUploading(false);
        }
      }

      const actionType = selectedOrder.type === 'pickup' ? 'pickup_complete' : 'delivery_complete';
      await driverAction.mutateAsync({
        action: actionType,
        order_id: selectedOrder.id,
        photo_url: finalPhotoUrl,
        notes: photoNote || (selectedOrder.type === 'pickup' ? 'Contactless porch pickup verified' : 'Delivered to porch'),
      });

      addToast({
        type: 'success',
        title: selectedOrder.type === 'pickup' ? 'Pickup Confirmed' : 'Delivery Logged',
        message: `Order #${selectedOrder.number} status updated and customer SMS/WhatsApp dispatched.`,
      });

      setSelectedOrder(null);
      setPhotoNote('');
      setPhotoPreview(null);
      setPhotoFile(null);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Action Failed',
        message: (err as Error).message,
      });
    }
  };

  const handleLoadForDelivery = async (orderId: string, orderNumber: string) => {
    try {
      await driverAction.mutateAsync({
        action: 'load_for_delivery',
        order_id: orderId,
      });

      addToast({
        type: 'success',
        title: 'Loaded into Van',
        message: `Order #${orderNumber} picked up from plant and loaded into your delivery van.`,
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Loading Failed',
        message: (err as Error).message,
      });
    }
  };

  return (
    <AuthGuard allowedRoles={['admin', 'driver']}>
      <div className={styles.page}>
        <div className={styles.container}>
          {/* Driver Top Header */}
          <div className={styles.driverHeader}>
            <div className={styles.brandCol}>
              <Image
                src="/icon.webp"
                alt="First Eleven"
                width={42}
                height={42}
                style={{ borderRadius: '8px', objectFit: 'contain' }}
              />
              <div>
                <h1 className={styles.driverTitle}>First Eleven Driver</h1>
                <p className={styles.driverSub}>DFW Mobile Route Manifest</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <RefreshButton
                onRefresh={refetch}
                size="sm"
                variant="glass"
              />
              <Link href={ROUTES.dashboard} className={styles.portalLink}>
                Exit to App →
              </Link>
            </div>
          </div>

          {/* Shift Filter */}
          <div className={styles.shiftRow}>
            <button
              type="button"
              className={`${styles.shiftBtn} ${shift === 'all' ? styles.shiftBtnActive : ''}`}
              onClick={() => setShift('all')}
            >
              All Shifts
            </button>
            <button
              type="button"
              className={`${styles.shiftBtn} ${shift === 'morning' ? styles.shiftBtnActive : ''}`}
              onClick={() => setShift('morning')}
            >
              🌅 Morning (7:30–10AM)
            </button>
            <button
              type="button"
              className={`${styles.shiftBtn} ${shift === 'evening' ? styles.shiftBtnActive : ''}`}
              onClick={() => setShift('evening')}
            >
              🌆 Evening (5–8PM)
            </button>
          </div>

          {/* Workstream Switcher (Both Streams / Pickups / Deliveries) */}
          <div className={styles.viewModeRow}>
            <button
              type="button"
              className={`${styles.viewModeBtn} ${viewFilter === 'all' ? styles.viewModeBtnActive : ''}`}
              onClick={() => setViewFilter('all')}
            >
              <span>📋 Both Streams (Side by Side)</span>
            </button>
            <button
              type="button"
              className={`${styles.viewModeBtn} ${viewFilter === 'pickups' ? styles.viewModeBtnActive : ''}`}
              onClick={() => setViewFilter('pickups')}
            >
              <span>🧺 Order Pick Up</span>
              <span className={styles.tabBadge}>{pickups.length + inVan.length}</span>
            </button>
            <button
              type="button"
              className={`${styles.viewModeBtn} ${viewFilter === 'deliveries' ? styles.viewModeBtnActive : ''}`}
              onClick={() => setViewFilter('deliveries')}
            >
              <span>🚚 Order Delivery</span>
              <span className={styles.tabBadge}>{readyAtPlant.length + deliveries.length}</span>
            </button>
          </div>

          {isLoading ? (
            <Loader text="Loading live route stops..." />
          ) : (
            <div className={`${styles.tablesGrid} ${viewFilter === 'all' ? styles.tablesGridSideBySide : ''}`}>
              {/* ============================================================ */}
              {/* TABLE 1: ORDER PICK UP (Inbound to Plant)                    */}
              {/* ============================================================ */}
              {(viewFilter === 'all' || viewFilter === 'pickups') && (
                <div className={styles.tablePanel}>
                  <div className={styles.tableHeader}>
                    <h2 className={styles.tableTitle}>🧺 Order Pick Up</h2>
                    <span style={{ fontSize: 'var(--text-xs)', color: '#94a3b8' }}>
                      Inbound to Plant
                    </span>
                  </div>

                  {/* Pick Up Sub-Tabs */}
                  <div className={styles.pickupTabRow}>
                    <button
                      type="button"
                      className={`${styles.tabBtn} ${pickupTab === 'to_pickup' ? styles.tabBtnActive : ''}`}
                      onClick={() => setPickupTab('to_pickup')}
                    >
                      <span>To Pick Up</span>
                      <span className={styles.tabBadge}>{pickups.length}</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.tabBtn} ${pickupTab === 'in_van' ? styles.tabBtnActive : ''}`}
                      onClick={() => setPickupTab('in_van')}
                    >
                      <span>In My Van</span>
                      <span className={styles.tabBadge}>{inVan.length}</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.tabBtn} ${pickupTab === 'picked_up' ? styles.tabBtnActive : ''}`}
                      onClick={() => setPickupTab('picked_up')}
                    >
                      <span>Picked Up</span>
                      <span className={styles.tabBadge}>{pickedUpCompleted.length}</span>
                    </button>
                  </div>

                  {/* Pick Up Content */}
                  {pickupTab === 'to_pickup' ? (
                    pickups.length === 0 ? (
                      <div className={styles.emptyState}>
                        <span style={{ fontSize: 'var(--text-3xl)', display: 'block', marginBottom: '8px' }}>🧺</span>
                        <h3>No Pickups Remaining</h3>
                        <p>All scheduled pickups for this shift have been collected.</p>
                      </div>
                    ) : (
                      <div className={styles.stopsList}>
                        {pickups.map((order, idx) => (
                          <DriverStopCard
                            key={order.id}
                            order={order}
                            stopIndex={idx}
                            type="to_pickup"
                            onActionClick={setSelectedOrder}
                          />
                        ))}
                      </div>
                    )
                  ) : pickupTab === 'in_van' ? (
                    inVan.length === 0 ? (
                      <div className={styles.emptyState}>
                        <span style={{ fontSize: 'var(--text-3xl)', display: 'block', marginBottom: '8px' }}>🚐</span>
                        <h3>No Bags in Van Right Now</h3>
                        <p>Items you collect will appear here while in transit to the plant.</p>
                      </div>
                    ) : (
                      <div className={styles.stopsList}>
                        {inVan.map((order, idx) => (
                          <DriverStopCard
                            key={order.id}
                            order={order}
                            stopIndex={idx}
                            type="in_van"
                            onZoomPhoto={setZoomPhotoUrl}
                          />
                        ))}
                      </div>
                    )
                  ) : (
                    /* Picked Up History Tab */
                    pickedUpCompleted.length === 0 ? (
                      <div className={styles.emptyState}>
                        <span style={{ fontSize: 'var(--text-3xl)', display: 'block', marginBottom: '8px' }}>📜</span>
                        <h3>No Completed Pickups Recorded</h3>
                        <p>Completed customer pickups delivered to the plant will be listed here.</p>
                      </div>
                    ) : (
                      <div className={styles.stopsList}>
                        {pickedUpCompleted.map((order, idx) => (
                          <DriverStopCard
                            key={order.id}
                            order={order}
                            stopIndex={idx}
                            type="picked_up"
                            onZoomPhoto={setZoomPhotoUrl}
                          />
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}

              {/* ============================================================ */}
              {/* TABLE 2: ORDER DELIVERY (Outbound to Customers)             */}
              {/* ============================================================ */}
              {(viewFilter === 'all' || viewFilter === 'deliveries') && (
                <div className={styles.tablePanel}>
                  <div className={styles.tableHeader}>
                    <h2 className={styles.tableTitle}>🚚 Order Delivery</h2>
                    <span style={{ fontSize: 'var(--text-xs)', color: '#94a3b8' }}>
                      Outbound to Customers
                    </span>
                  </div>

                  {/* Delivery Sub-Tabs */}
                  <div className={styles.deliveryTabRow}>
                    <button
                      type="button"
                      className={`${styles.tabBtn} ${deliveryTab === 'to_deliver' ? styles.tabBtnActive : ''}`}
                      onClick={() => setDeliveryTab('to_deliver')}
                    >
                      <span>To Deliver</span>
                      <span className={styles.tabBadge}>{readyAtPlant.length + deliveries.length}</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.tabBtn} ${deliveryTab === 'delivered' ? styles.tabBtnActive : ''}`}
                      onClick={() => setDeliveryTab('delivered')}
                    >
                      <span>Delivered</span>
                      <span className={styles.tabBadge}>{delivered.length}</span>
                    </button>
                  </div>

                  {/* Delivery Content */}
                  {deliveryTab === 'to_deliver' ? (
                    readyAtPlant.length === 0 && deliveries.length === 0 ? (
                      <div className={styles.emptyState}>
                        <span style={{ fontSize: 'var(--text-3xl)', display: 'block', marginBottom: '8px' }}>✨</span>
                        <h3>No Deliveries Ready</h3>
                        <p>Orders will appear here once cleaning is completed by the plant team.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                        {/* Step 1: Ready at Plant to Load */}
                        {readyAtPlant.length > 0 && (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                              <h3 style={{ fontSize: 'var(--text-xs)', color: '#f59e0b', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>
                                🏢 Step 1: Pick Up from Plant ({readyAtPlant.length} Ready to Load)
                              </h3>
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Load into van</span>
                            </div>

                            <div className={styles.stopsList}>
                              {readyAtPlant.map((order, idx) => (
                                <DriverStopCard
                                  key={order.id}
                                  order={order}
                                  stopIndex={idx}
                                  type="ready_at_plant"
                                  onActionClick={setSelectedOrder}
                                  onLoadForDelivery={handleLoadForDelivery}
                                  isActionPending={driverAction.isPending}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Step 2: Active Drops on Route */}
                        {deliveries.length > 0 && (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                              <h3 style={{ fontSize: 'var(--text-xs)', color: '#10b981', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>
                                🚚 Step 2: Active Drops on My Route ({deliveries.length} In Van)
                              </h3>
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Drop off to customer</span>
                            </div>

                            <div className={styles.stopsList}>
                              {deliveries.map((order, idx) => (
                                <DriverStopCard
                                  key={order.id}
                                  order={order}
                                  stopIndex={idx}
                                  type="to_deliver"
                                  onActionClick={setSelectedOrder}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    /* Delivered Tab (Previously Done) */
                    delivered.length === 0 ? (
                      <div className={styles.emptyState}>
                        <span style={{ fontSize: 'var(--text-3xl)', display: 'block', marginBottom: '8px' }}>🏁</span>
                        <h3>No Completed Deliveries Logged</h3>
                        <p>Orders you successfully drop off with photo proof will appear here.</p>
                      </div>
                    ) : (
                      <div className={styles.stopsList}>
                        {delivered.map((order, idx) => (
                          <DriverStopCard
                            key={order.id}
                            order={order}
                            stopIndex={idx}
                            type="delivered"
                            onZoomPhoto={setZoomPhotoUrl}
                          />
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* Photo Proof Confirmation Modal */}
          <Modal
            isOpen={Boolean(selectedOrder)}
            onClose={() => setSelectedOrder(null)}
            title={selectedOrder?.type === 'pickup' ? '📸 Verify Contactless Pickup' : '✅ Verify Drop-Off Proof'}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-navy)', margin: 0 }}>
                Order <strong>#{selectedOrder?.number}</strong> — Capture a quick photo of the laundry bag at the porch or concierge desk to attach to the customer&apos;s live tracking link.
              </p>

              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
                  Camera Snapshot (or File Upload)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  style={{ width: '100%', fontSize: 'var(--text-xs)' }}
                />
              </div>

              {photoPreview && (
                <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', maxHeight: '200px', border: '1px solid var(--color-gray-300)', background: '#0f172a', display: 'flex', justifyContent: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="Captured proof" style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain' }} />
                </div>
              )}

              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                  Optional Driver Note
                </label>
                <input
                  type="text"
                  value={photoNote}
                  onChange={(e) => setPhotoNote(e.target.value)}
                  placeholder="e.g. Left behind right porch column"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-gray-300)',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </div>

              {!photoPreview && (
                <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #f87171', borderRadius: 'var(--radius-md)', color: '#b91c1c', fontSize: 'var(--text-xs)', fontWeight: 'bold' }}>
                  📸 A photo snapshot is strictly required to verify this stop before you can confirm.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                <Button variant="ghost" onClick={() => setSelectedOrder(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleExecuteAction}
                  isLoading={driverAction.isPending || isUploading}
                  disabled={driverAction.isPending || isUploading || !photoPreview}
                >
                  {isUploading ? 'Uploading & Securing...' : (selectedOrder?.type === 'pickup' ? 'Confirm Pickup & Send SMS' : 'Complete Delivery & Send SMS')}
                </Button>
              </div>
            </div>
          </Modal>

          {/* Zoom Lightbox Modal */}
          <Modal
            isOpen={Boolean(zoomPhotoUrl)}
            onClose={() => setZoomPhotoUrl(null)}
            title="📸 High-Resolution Photo Record"
            size="lg"
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              {zoomPhotoUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={zoomPhotoUrl}
                  alt="Full preview"
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
    </AuthGuard>
  );
}
