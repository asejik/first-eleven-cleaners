'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useDriverManifest, useDriverAction } from '@/hooks/useDriver';
import { Button, Badge, Loader, Modal } from '@/components/ui';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useUIStore } from '@/stores/ui-store';
import { ROUTES } from '@/lib/constants';
import styles from './page.module.css';

export default function DriverPage() {
  const [shift, setShift] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'pickups' | 'picked_up' | 'deliveries' | 'completed'>('pickups');
  const { data, isLoading } = useDriverManifest(shift);
  const driverAction = useDriverAction();
  const addToast = useUIStore((s) => s.addToast);

  // Photo modal state
  const [selectedOrder, setSelectedOrder] = useState<{ id: string; number: string; type: 'pickup' | 'delivery' } | null>(null);
  const [photoNote, setPhotoNote] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Expanded Zoom Photo Modal
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null);

  const pickups = data?.pickups || [];
  const pickedUpHistory = data?.picked_up_history || [];
  const deliveries = data?.deliveries || [];
  const completed = data?.completed || [];

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExecuteAction = async () => {
    if (!selectedOrder) return;

    try {
      const actionType = selectedOrder.type === 'pickup' ? 'pickup_complete' : 'delivery_complete';
      await driverAction.mutateAsync({
        action: actionType,
        order_id: selectedOrder.id,
        photo_url: photoPreview || 'https://images.unsplash.com/photo-1545173168-9f1947eebb7f?auto=format&fit=crop&q=80&w=600',
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
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Action Failed',
        message: (err as Error).message,
      });
    }
  };

  const handleOutForDelivery = async (orderId: string, orderNumber: string) => {
    try {
      await driverAction.mutateAsync({
        action: 'out_for_delivery',
        order_id: orderId,
      });

      addToast({
        type: 'info',
        title: 'Out for Delivery',
        message: `Order #${orderNumber} is now marked Out for Delivery.`,
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Update Failed',
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
              src="/icon.png"
              alt="First Eleven"
              width={42}
              height={42}
              style={{ borderRadius: '8px', objectFit: 'cover' }}
            />
            <div>
              <h1 className={styles.driverTitle}>First Eleven Driver</h1>
              <p className={styles.driverSub}>DFW Mobile Route Manifest</p>
            </div>
          </div>
          <Link href={ROUTES.dashboard} className={styles.portalLink}>
            Exit to App →
          </Link>
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

        {/* Tab Switcher */}
        <div className={styles.tabRow}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'pickups' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('pickups')}
          >
            <span>To Pick Up</span>
            <span className={styles.tabBadge}>{pickups.length}</span>
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'picked_up' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('picked_up')}
          >
            <span>Picked Up</span>
            <span className={styles.tabBadge}>{pickedUpHistory.length}</span>
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'deliveries' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('deliveries')}
          >
            <span>To Deliver</span>
            <span className={styles.tabBadge}>{deliveries.length}</span>
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'completed' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            <span>Done</span>
            <span className={styles.tabBadge}>{completed.length}</span>
          </button>
        </div>

        {/* Stops List */}
        {isLoading ? (
          <Loader text="Loading live route stops..." />
        ) : activeTab === 'pickups' ? (
          pickups.length === 0 ? (
            <div className={styles.emptyState}>
              <span style={{ fontSize: 'var(--text-3xl)', display: 'block', marginBottom: '8px' }}>🧺</span>
              <h3>No Pickups Remaining</h3>
              <p>All scheduled pickups for this shift have been collected.</p>
            </div>
          ) : (
            <div className={styles.stopsList}>
              {pickups.map((order, idx) => {
                const customer = order.customer;
                const address = order.address;
                const orderNum = order.order_number || order.id.slice(0, 8);
                const mapsUrl = address
                  ? `https://maps.google.com/?q=${encodeURIComponent(`${address.street}, ${address.city}, ${address.state} ${address.zip}`)}`
                  : '#';

                return (
                  <div key={order.id} className={styles.stopCard}>
                    <div className={styles.stopHead}>
                      <div>
                        <span className={styles.stopNumber}>Stop #{idx + 1} • Pickup</span>
                        <h2 className={styles.customerName}>{customer?.full_name || 'Customer'}</h2>
                      </div>
                      <Badge variant="warning">
                        {order.pickup_window === 'morning' ? 'Morning' : 'Evening'}
                      </Badge>
                    </div>

                    <div className={styles.addressBox}>
                      <span className={styles.streetText}>
                        📍 {address?.street} {address?.unit && `(${address?.unit})`}
                      </span>
                      <p className={styles.cityZipText}>
                        {address?.city}, {address?.state} {address?.zip}
                      </p>
                      {address?.delivery_notes && (
                        <div className={styles.notesAlert}>
                          <strong>Access / Porch Note:</strong> {address.delivery_notes}
                        </div>
                      )}
                    </div>

                    <div className={styles.actionsGrid}>
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={styles.navBtn}>
                        🗺️ GPS Map
                      </a>
                      <a href={`tel:${customer?.phone || ''}`} className={styles.navBtn}>
                        📞 Call Customer
                      </a>

                      <button
                        type="button"
                        className={`${styles.primaryActionBtn} ${styles.pickupBtn}`}
                        onClick={() => setSelectedOrder({ id: order.id, number: orderNum, type: 'pickup' })}
                      >
                        📸 Verify & Pick Up Bag (#{orderNum})
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : activeTab === 'picked_up' ? (
          pickedUpHistory.length === 0 ? (
            <div className={styles.emptyState}>
              <span style={{ fontSize: 'var(--text-3xl)', display: 'block', marginBottom: '8px' }}>🚐</span>
              <h3>No Picked Up Bags Yet</h3>
              <p>Items you collect during this shift will be listed here with photo verification records.</p>
            </div>
          ) : (
            <div className={styles.stopsList}>
              {pickedUpHistory.map((order, idx) => {
                const customer = order.customer;
                const address = order.address;
                const orderNum = order.order_number || order.id.slice(0, 8);
                const pickupPhoto = order.photos?.find((p) => p.photo_type === 'pickup_proof') || order.photos?.[0];

                return (
                  <div key={order.id} className={styles.stopCard}>
                    <div className={styles.stopHead}>
                      <div>
                        <span className={styles.stopNumber}>Collected #{idx + 1}</span>
                        <h2 className={styles.customerName}>{customer?.full_name}</h2>
                      </div>
                      <Badge variant="picked_up">
                        {order.status === 'picked_up' ? 'In Van / En Route' : order.status === 'weighed_itemized' ? 'At Plant (Weighed)' : 'In Cleaning'}
                      </Badge>
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                      {pickupPhoto && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={pickupPhoto.photo_url}
                          alt="Pickup proof"
                          className={styles.proofThumb}
                          onClick={() => setZoomPhotoUrl(pickupPhoto.photo_url)}
                          title="Click to view full photo"
                        />
                      )}
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 'var(--text-xs)', color: '#ffffff', fontWeight: 'bold', margin: '0 0 2px' }}>
                          Order #{orderNum} • {order.order_type.toUpperCase()}
                        </p>
                        <p style={{ fontSize: 'var(--text-xs)', color: '#cbd5e1', margin: 0 }}>
                          📍 {address?.street}, {address?.city}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : activeTab === 'deliveries' ? (
          deliveries.length === 0 ? (
            <div className={styles.emptyState}>
              <span style={{ fontSize: 'var(--text-3xl)', display: 'block', marginBottom: '8px' }}>🚚</span>
              <h3>No Deliveries Pending</h3>
              <p>No active garments waiting for delivery in this shift.</p>
            </div>
          ) : (
            <div className={styles.stopsList}>
              {deliveries.map((order, idx) => {
                const customer = order.customer;
                const address = order.address;
                const orderNum = order.order_number || order.id.slice(0, 8);
                const mapsUrl = address
                  ? `https://maps.google.com/?q=${encodeURIComponent(`${address.street}, ${address.city}, ${address.state} ${address.zip}`)}`
                  : '#';

                return (
                  <div key={order.id} className={styles.stopCard}>
                    <div className={styles.stopHead}>
                      <div>
                        <span className={styles.stopNumber}>Drop #{idx + 1} • {order.status.replace('_', ' ').toUpperCase()}</span>
                        <h2 className={styles.customerName}>{customer?.full_name || 'Customer'}</h2>
                      </div>
                      <Badge variant={order.status === 'out_for_delivery' ? 'out_for_delivery' : 'cleaning'}>
                        {order.status === 'out_for_delivery' ? 'En Route' : 'Ready in Plant'}
                      </Badge>
                    </div>

                    <div className={styles.addressBox}>
                      <span className={styles.streetText}>
                        📍 {address?.street} {address?.unit && `(${address?.unit})`}
                      </span>
                      <p className={styles.cityZipText}>
                        {address?.city}, {address?.state} {address?.zip}
                      </p>
                      {address?.delivery_notes && (
                        <div className={styles.notesAlert}>
                          <strong>Drop Spot:</strong> {address.delivery_notes}
                        </div>
                      )}
                    </div>

                    <div className={styles.actionsGrid}>
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={styles.navBtn}>
                        🗺️ GPS Map
                      </a>
                      <a href={`tel:${customer?.phone || ''}`} className={styles.navBtn}>
                        📞 Call Customer
                      </a>

                      {order.status !== 'out_for_delivery' ? (
                        <button
                          type="button"
                          className={`${styles.primaryActionBtn} ${styles.deliverBtn}`}
                          onClick={() => handleOutForDelivery(order.id, orderNum)}
                          disabled={driverAction.isPending}
                        >
                          🚚 Load in Van & Mark Out for Delivery
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`${styles.primaryActionBtn} ${styles.pickupBtn}`}
                          onClick={() => setSelectedOrder({ id: order.id, number: orderNum, type: 'delivery' })}
                        >
                          ✅ Confirm Delivered + Photo Proof
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className={styles.stopsList}>
            {completed.map((order) => (
              <div key={order.id} className={styles.stopCard} style={{ opacity: 0.85 }}>
                <div className={styles.stopHead}>
                  <div>
                    <span className={styles.stopNumber}>Completed #{order.order_number || order.id.slice(0, 8)}</span>
                    <h2 className={styles.customerName}>{order.customer?.full_name}</h2>
                  </div>
                  <Badge variant="delivered">Delivered</Badge>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: '#cbd5e1', margin: 0 }}>
                  📍 {order.address?.street}, {order.address?.city}
                </p>
              </div>
            ))}
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button variant="ghost" onClick={() => setSelectedOrder(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleExecuteAction}
                isLoading={driverAction.isPending}
              >
                {selectedOrder?.type === 'pickup' ? 'Confirm Pickup & Send SMS' : 'Complete Delivery & Send SMS'}
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
