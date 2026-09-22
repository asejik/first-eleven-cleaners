'use client';

import { Badge } from '@/components/ui';
import type { Order } from '@/types';
import styles from '@/app/staff/driver/page.module.css';

export interface DriverStopCardProps {
  order: Order;
  stopIndex: number;
  type: 'to_pickup' | 'in_van' | 'picked_up' | 'ready_at_plant' | 'to_deliver' | 'delivered';
  onActionClick?: (order: { id: string; number: string; type: 'pickup' | 'delivery' }) => void;
  onLoadForDelivery?: (orderId: string, orderNumber: string) => void;
  onZoomPhoto?: (url: string) => void;
  isActionPending?: boolean;
}

export function formatTimestamp(timestamp?: string | null) {
  if (!timestamp) return null;
  const dateObj = new Date(timestamp);
  if (isNaN(dateObj.getTime())) return null;
  return (
    dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' +
    dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
  );
}

export function DriverStopCard({
  order,
  stopIndex,
  type,
  onActionClick,
  onLoadForDelivery,
  onZoomPhoto,
  isActionPending = false,
}: DriverStopCardProps) {
  const customer = order.customer;
  const address = order.address;
  const orderNum = order.order_number || order.id.slice(0, 8);
  const mapsUrl = address
    ? `https://maps.google.com/?q=${encodeURIComponent(`${address.street}, ${address.city}, ${address.state} ${address.zip}`)}`
    : '#';

  if (type === 'to_pickup') {
    return (
      <div className={styles.stopCard}>
        <div className={styles.stopHead}>
          <div>
            <span className={styles.stopNumber}>Stop #{stopIndex + 1} • Pickup</span>
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
          onClick={() => onActionClick?.({ id: order.id, number: orderNum, type: 'pickup' })}
        >
          📸 Confirm Pickup + Photo Proof
        </button>
      </div>
    );
  }

  if (type === 'in_van') {
    const pickupPhoto = order.photos?.find((p) => p.photo_type === 'pickup_proof') || order.photos?.[0];
    return (
      <div className={styles.stopCard}>
        <div className={styles.stopHead}>
          <div>
            <span className={styles.stopNumber}>In Van #{stopIndex + 1}</span>
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
              onClick={() => onZoomPhoto?.(pickupPhoto.photo_url)}
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
  }

  if (type === 'picked_up') {
    const pickupPhoto = order.photos?.find((p) => p.photo_type === 'pickup_proof');
    const pickupEvent = order.events?.find((e) => e.status === 'picked_up');
    const pickupTime = pickupPhoto?.captured_at || pickupEvent?.timestamp || order.created_at;
    const formattedTime = formatTimestamp(pickupTime);

    return (
      <div className={styles.stopCard} style={{ opacity: 0.95 }}>
        <div className={styles.stopHead}>
          <div>
            <span className={styles.stopNumber}>Collected #{stopIndex + 1} • #{orderNum}</span>
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
              onClick={() => onZoomPhoto?.(pickupPhoto.photo_url)}
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
  }

  if (type === 'ready_at_plant') {
    return (
      <div className={styles.stopCard} style={{ borderLeft: '3px solid #f59e0b' }}>
        <div className={styles.stopHead}>
          <div>
            <span className={styles.stopNumber}>Plant Order #{stopIndex + 1}</span>
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
            onClick={() => onLoadForDelivery?.(order.id, orderNum)}
            disabled={isActionPending}
            style={{ flex: 1 }}
          >
            🚐 Load into My Van
          </button>
          <button
            type="button"
            className={`${styles.primaryActionBtn} ${styles.pickupBtn}`}
            onClick={() => onActionClick?.({ id: order.id, number: orderNum, type: 'delivery' })}
            style={{ flex: 1 }}
          >
            ✅ Deliver + Proof
          </button>
        </div>
      </div>
    );
  }

  if (type === 'to_deliver') {
    return (
      <div className={styles.stopCard} style={{ borderLeft: '3px solid #10b981' }}>
        <div className={styles.stopHead}>
          <div>
            <span className={styles.stopNumber}>Drop #{stopIndex + 1}</span>
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
          onClick={() => onActionClick?.({ id: order.id, number: orderNum, type: 'delivery' })}
        >
          ✅ Confirm Delivered + Photo Proof
        </button>
      </div>
    );
  }

  // type === 'delivered'
  const deliveryPhoto = order.photos?.find((p) => p.photo_type === 'delivery_proof');
  const deliveryEvent = order.events?.find((e) => e.status === 'delivered');
  const deliveryTime = deliveryPhoto?.captured_at || deliveryEvent?.timestamp || order.updated_at || order.delivery_date;
  const formattedTime = formatTimestamp(deliveryTime);

  return (
    <div className={styles.stopCard} style={{ opacity: 0.95 }}>
      <div className={styles.stopHead}>
        <div>
          <span className={styles.stopNumber}>Drop #{stopIndex + 1} • #{orderNum}</span>
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
            onClick={() => onZoomPhoto?.(deliveryPhoto.photo_url)}
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
}
