'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useDriverManifest, useDriverAction } from '@/hooks/useDriver';
import { Button, Badge, Loader, Modal, RefreshButton } from '@/components/ui';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useUIStore } from '@/stores/ui-store';
import { ROUTES } from '@/lib/constants';
import styles from './page.module.css';

export default function DriverPage() {
  const [shift, setShift] = useState<string>('all');
  const [viewFilter, setViewFilter] = useState<'all' | 'pickups' | 'deliveries'>('all');
  const [pickupTab, setPickupTab] = useState<'to_pickup' | 'in_van' | 'picked_up'>('to_pickup');
  const [deliveryTab, setDeliveryTab] = useState<'to_deliver' | 'delivered'>('to_deliver');
  
  const { data, isLoading, refetch, isFetching } = useDriverManifest(shift);
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

  const formatTimestamp = (timestamp?: string | null) => {
    if (!timestamp) return null;
    const dateObj = new Date(timestamp);
    if (isNaN(dateObj.getTime())) return null;
    return (
      dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' at ' +
      dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
    );
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
                isRefreshing={isFetching}
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
                                  📞 Call
                                </a>
                              </div>

                              <button
                                type="button"
                                className={`${styles.primaryActionBtn} ${styles.pickupBtn}`}
                                onClick={() => setSelectedOrder({ id: order.id, number: orderNum, type: 'pickup' })}
                              >
                                📸 Confirm Pickup + Photo Proof
                              </button>
                            </div>
                          );
                        })}
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
                        {inVan.map((order, idx) => {
                          const customer = order.customer;
                          const address = order.address;
                          const pickupPhoto = order.photos?.find((p) => p.photo_type === 'pickup_proof') || order.photos?.[0];

                          return (
                            <div key={order.id} className={styles.stopCard}>
                              <div className={styles.stopHead}>
                                <div>
                                  <span className={styles.stopNumber}>In Van #{idx + 1}</span>
                                  <h2 className={styles.customerName}>{customer?.full_name}</h2>
                                </div>
                                <Badge variant="picked_up">In Van En Route</Badge>
                              </div>

                              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                                {pickupPhoto && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={pickupPhoto.photo_url}
                                    alt="Pickup Verification"
                                    className={styles.proofThumb}
                                    onClick={() => setZoomPhotoUrl(pickupPhoto.photo_url)}
                                  />
                                )}
                                <div style={{ fontSize: 'var(--text-xs)', color: '#cbd5e1' }}>
                                  <div>📍 {address?.street}, {address?.city}</div>
                                  <div style={{ color: '#10b981', marginTop: '2px' }}>
                                    🚚 Secured in van • Ready for plant drop-off
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
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
                        {pickedUpCompleted.map((order, idx) => {
                          const customer = order.customer;
                          const address = order.address;
                          const orderNum = order.order_number || order.id.slice(0, 8);
                          const pickupPhoto = order.photos?.find((p) => p.photo_type === 'pickup_proof');
                          const pickupEvent = order.events?.find((e) => e.status === 'picked_up');
                          const pickupTime = pickupPhoto?.captured_at || pickupEvent?.timestamp || order.created_at;
                          const formattedTime = formatTimestamp(pickupTime);

                          return (
                            <div key={order.id} className={styles.stopCard} style={{ opacity: 0.95 }}>
                              <div className={styles.stopHead}>
                                <div>
                                  <span className={styles.stopNumber}>Collected #{idx + 1} • #{orderNum}</span>
                                  <h2 className={styles.customerName}>{customer?.full_name || 'Customer'}</h2>
                                </div>
                                <Badge variant="picked_up">🏢 Plant Delivered</Badge>
                              </div>

                              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                                {pickupPhoto && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={pickupPhoto.photo_url}
                                    alt="Pickup Verification"
                                    className={styles.proofThumb}
                                    onClick={() => setZoomPhotoUrl(pickupPhoto.photo_url)}
                                    title="Click to view photo proof"
                                  />
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                  <span style={{ fontSize: 'var(--text-xs)', color: '#cbd5e1' }}>
                                    📍 {address?.street}, {address?.city}
                                  </span>
                                  {formattedTime && (
                                    <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 500 }}>
                                      🕒 Picked Up: {formattedTime}
                                    </span>
                                  )}
                                  <span style={{ fontSize: '11px', color: '#10b981' }}>
                                    ✓ Handed off to Central Intake
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
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
                              {readyAtPlant.map((order, idx) => {
                                const customer = order.customer;
                                const address = order.address;
                                const orderNum = order.order_number || order.id.slice(0, 8);

                                return (
                                  <div key={order.id} className={styles.stopCard} style={{ borderLeft: '3px solid #f59e0b' }}>
                                    <div className={styles.stopHead}>
                                      <div>
                                        <span className={styles.stopNumber}>Plant Order #{idx + 1}</span>
                                        <h2 className={styles.customerName}>{customer?.full_name || 'Customer'}</h2>
                                      </div>
                                      <Badge variant="cleaning">Ready at Plant</Badge>
                                    </div>

                                    <div className={styles.addressBox}>
                                      <span className={styles.streetText}>
                                        📍 Destination: {address?.street} {address?.unit && `(${address?.unit})`}
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

                                    <div style={{ display: 'flex', gap: '8px', marginTop: 'var(--space-3)' }}>
                                      <button
                                        type="button"
                                        className={`${styles.primaryActionBtn} ${styles.deliverBtn}`}
                                        onClick={() => handleLoadForDelivery(order.id, orderNum)}
                                        disabled={driverAction.isPending}
                                        style={{ flex: 1 }}
                                      >
                                        🚐 Load into My Van
                                      </button>
                                      <button
                                        type="button"
                                        className={`${styles.primaryActionBtn} ${styles.pickupBtn}`}
                                        onClick={() => setSelectedOrder({ id: order.id, number: orderNum, type: 'delivery' })}
                                        style={{ flex: 1 }}
                                      >
                                        ✅ Deliver + Proof
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
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
                              {deliveries.map((order, idx) => {
                                const customer = order.customer;
                                const address = order.address;
                                const orderNum = order.order_number || order.id.slice(0, 8);
                                const mapsUrl = address
                                  ? `https://maps.google.com/?q=${encodeURIComponent(`${address.street}, ${address.city}, ${address.state} ${address.zip}`)}`
                                  : '#';

                                return (
                                  <div key={order.id} className={styles.stopCard} style={{ borderLeft: '3px solid #10b981' }}>
                                    <div className={styles.stopHead}>
                                      <div>
                                        <span className={styles.stopNumber}>Drop #{idx + 1}</span>
                                        <h2 className={styles.customerName}>{customer?.full_name || 'Customer'}</h2>
                                      </div>
                                      <Badge variant="out_for_delivery">
                                        {order.delivery_window === 'morning' ? 'Morning (7:30-10AM)' : 'Evening (5-8PM)'}
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
                                    </div>

                                    <button
                                      type="button"
                                      className={`${styles.primaryActionBtn} ${styles.pickupBtn}`}
                                      onClick={() => setSelectedOrder({ id: order.id, number: orderNum, type: 'delivery' })}
                                    >
                                      ✅ Confirm Delivered + Photo Proof
                                    </button>
                                  </div>
                                );
                              })}
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
                        {delivered.map((order, idx) => {
                          const customer = order.customer;
                          const address = order.address;
                          const orderNum = order.order_number || order.id.slice(0, 8);
                          const deliveryPhoto = order.photos?.find((p) => p.photo_type === 'delivery_proof');
                          const deliveryEvent = order.events?.find((e) => e.status === 'delivered');
                          const deliveryTime = deliveryPhoto?.captured_at || deliveryEvent?.timestamp || order.updated_at || order.delivery_date;
                          const formattedTime = formatTimestamp(deliveryTime);

                          return (
                            <div key={order.id} className={styles.stopCard} style={{ opacity: 0.95 }}>
                              <div className={styles.stopHead}>
                                <div>
                                  <span className={styles.stopNumber}>Drop #{idx + 1} • #{orderNum}</span>
                                  <h2 className={styles.customerName}>{customer?.full_name || 'Customer'}</h2>
                                </div>
                                <Badge variant="delivered">Delivered</Badge>
                              </div>

                              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                                {deliveryPhoto && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={deliveryPhoto.photo_url}
                                    alt="Delivery Verification"
                                    className={styles.proofThumb}
                                    onClick={() => setZoomPhotoUrl(deliveryPhoto.photo_url)}
                                    title="Click to view delivery proof"
                                  />
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                  <span style={{ fontSize: 'var(--text-xs)', color: '#cbd5e1' }}>
                                    📍 {address?.street}, {address?.city}
                                  </span>
                                  {formattedTime && (
                                    <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 500 }}>
                                      🕒 Delivered: {formattedTime}
                                    </span>
                                  )}
                                  <span style={{ fontSize: '11px', color: '#10b981' }}>
                                    ✓ Verified drop-off at customer doorstep
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
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
