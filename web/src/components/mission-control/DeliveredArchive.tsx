'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { Badge } from '@/components/ui';
import type { Order } from '@/types';
import styles from './DeliveredArchive.module.css';

interface DeliveredArchiveProps {
  orders: Order[];
  onBackToPipeline?: () => void;
}

export function DeliveredArchive({ orders, onBackToPipeline }: DeliveredArchiveProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // 1. Extract only delivered orders
  const deliveredOrders = useMemo(() => {
    return orders.filter((o) => o.status === 'delivered');
  }, [orders]);

  // 2. Compute live metrics
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const todayCount = useMemo(() => {
    return deliveredOrders.filter((o) => {
      const deliveredEvent = o.events?.find((e) => e.status === 'delivered');
      const ts = deliveredEvent?.timestamp || o.updated_at || '';
      return ts.startsWith(todayStr);
    }).length;
  }, [deliveredOrders, todayStr]);

  const totalRevenue = useMemo(() => {
    return deliveredOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
  }, [deliveredOrders]);

  // 3. Filter orders based on user query and time pill
  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const currentDate = new Date();

    return deliveredOrders.filter((o) => {
      // Time filter
      const deliveredEvent = o.events?.find((e) => e.status === 'delivered');
      const timestamp = deliveredEvent?.timestamp || o.updated_at || o.created_at;
      const orderDate = timestamp ? new Date(timestamp) : null;

      if (!orderDate || isNaN(orderDate.getTime())) return false;

      if (dateFilter === 'today') {
        const orderDateStr = orderDate.toISOString().split('T')[0];
        if (orderDateStr !== todayStr) return false;
      } else if (dateFilter === 'week') {
        const sevenDaysAgo = new Date(currentDate);
        sevenDaysAgo.setDate(currentDate.getDate() - 7);
        if (orderDate < sevenDaysAgo) return false;
      } else if (dateFilter === 'month') {
        const thirtyDaysAgo = new Date(currentDate);
        thirtyDaysAgo.setDate(currentDate.getDate() - 30);
        if (orderDate < thirtyDaysAgo) return false;
      }

      // Search query
      if (!q) return true;

      const orderNum = (o.order_number || o.id).toLowerCase();
      const customerName = (o.customer?.full_name || '').toLowerCase();
      const customerEmail = (o.customer?.email || '').toLowerCase();
      const customerPhone = (o.customer?.phone || '').toLowerCase();
      const street = (o.address?.street || '').toLowerCase();
      const driver = (deliveredEvent?.triggered_by || '').toLowerCase();

      return (
        orderNum.includes(q) ||
        customerName.includes(q) ||
        customerEmail.includes(q) ||
        customerPhone.includes(q) ||
        street.includes(q) ||
        driver.includes(q)
      );
    });
  }, [deliveredOrders, searchQuery, dateFilter, todayStr]);

  const formatTimestamp = (ts?: string | null) => {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return (
      d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' at ' +
      d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
    );
  };

  const getDriverDisplay = (order: Order) => {
    const deliveredEvent = order.events?.find((e) => e.status === 'delivered');
    if (!deliveredEvent?.triggered_by) return 'DFW Fleet';
    const raw = deliveredEvent.triggered_by;
    const match = raw.match(/Driver \((.*?)(?:\[.*\])?\)/);
    if (match && match[1]) {
      return match[1].replace(/\s*\(Lead DFW Driver\)/i, '').trim();
    }
    return raw;
  };

  const getDeliveryPhoto = (order: Order) => {
    const photo = order.photos?.find((p) => p.photo_type === 'delivery_proof');
    return photo?.photo_url || null;
  };

  return (
    <div className={styles.archiveContainer}>
      {/* Header & Metric Bar */}
      <div className={styles.archiveHeader}>
        <div className={styles.titleArea}>
          <h2>
            <span>📦</span>
            <span>Delivered & Completed Archive</span>
          </h2>
          <p>
            Permanent historical audit trail of all completed laundry deliveries and contactless proof photos.
          </p>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.statBadge}>
            <span className={styles.statLabel}>Completed Deliveries:</span>
            <span className={styles.statValue}>{deliveredOrders.length}</span>
          </div>
          <div className={styles.statBadge}>
            <span className={styles.statLabel}>Delivered Today:</span>
            <span className={styles.statValue}>{todayCount}</span>
          </div>
          <div className={styles.statBadge}>
            <span className={styles.statLabel}>Completed Revenue:</span>
            <span className={styles.statValue}>${totalRevenue.toFixed(2)}</span>
          </div>
          {onBackToPipeline && (
            <button
              type="button"
              onClick={onBackToPipeline}
              style={{
                background: 'transparent',
                border: '1px solid #475569',
                color: '#e2e8f0',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ⬅ Back to Live Pipeline
            </button>
          )}
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className={styles.controlsRow}>
        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search order #, customer, driver, address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              ✕
            </button>
          )}
        </div>

        <div className={styles.filterPills}>
          <button
            type="button"
            className={`${styles.filterPill} ${dateFilter === 'all' ? styles.filterPillActive : ''}`}
            onClick={() => setDateFilter('all')}
          >
            All Time ({deliveredOrders.length})
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${dateFilter === 'today' ? styles.filterPillActive : ''}`}
            onClick={() => setDateFilter('today')}
          >
            Today ({todayCount})
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${dateFilter === 'week' ? styles.filterPillActive : ''}`}
            onClick={() => setDateFilter('week')}
          >
            Past 7 Days
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${dateFilter === 'month' ? styles.filterPillActive : ''}`}
            onClick={() => setDateFilter('month')}
          >
            Past 30 Days
          </button>
        </div>
      </div>

      {/* Delivered Orders Table */}
      <div className={styles.tableWrapper}>
        {filteredOrders.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📦</span>
            <p style={{ fontWeight: 600, color: '#ffffff', margin: '0 0 4px' }}>No completed orders found</p>
            <p style={{ fontSize: '11px', margin: 0 }}>
              {searchQuery ? 'Try adjusting your search query or date filter.' : 'Completed orders will appear here automatically.'}
            </p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Destination</th>
                <th>Delivered Time</th>
                <th>Driver</th>
                <th>Total Paid</th>
                <th>Proof</th>
                <th style={{ textAlign: 'right' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((o) => {
                const orderNum = o.order_number || o.id.slice(0, 8);
                const deliveredEvent = o.events?.find((e) => e.status === 'delivered');
                const deliveredTs = deliveredEvent?.timestamp || o.updated_at;
                const photoUrl = getDeliveryPhoto(o);
                const driverName = getDriverDisplay(o);

                return (
                  <tr key={o.id}>
                    <td>
                      <div className={styles.orderNumber}>#{orderNum}</div>
                      <Badge variant="delivered" style={{ marginTop: '4px' }}>
                        {o.order_type.toUpperCase()}
                      </Badge>
                    </td>
                    <td>
                      <div className={styles.customerName}>{o.customer?.full_name || 'Customer'}</div>
                      <div className={styles.customerContact}>
                        {o.customer?.phone || o.customer?.email || 'Contact on file'}
                      </div>
                    </td>
                    <td>
                      <div style={{ color: '#ffffff' }}>
                        📍 {o.address?.street} {o.address?.unit && `(${o.address?.unit})`}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {o.address?.city}, {o.address?.state} {o.address?.zip}
                      </div>
                    </td>
                    <td>
                      <div style={{ whiteSpace: 'nowrap' }}>{formatTimestamp(deliveredTs)}</div>
                      <div style={{ fontSize: '10px', color: '#10b981', fontWeight: 600 }}>Contactless Verified</div>
                    </td>
                    <td>
                      <span className={styles.driverTag}>🚐 {driverName}</span>
                    </td>
                    <td>
                      <span className={styles.totalText}>
                        {o.total ? `$${Number(o.total).toFixed(2)}` : '—'}
                      </span>
                    </td>
                    <td>
                      {photoUrl ? (
                        <button
                          type="button"
                          className={styles.proofBtn}
                          onClick={() => setSelectedOrder(o)}
                        >
                          📸 View Proof
                        </button>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Porch Drop</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className={styles.proofBtn}
                        onClick={() => setSelectedOrder(o)}
                      >
                        Inspect ➔
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Order Detail & Delivery Proof Modal */}
      {selectedOrder && (
        <div className={styles.modalOverlay} onClick={() => setSelectedOrder(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                Order #{selectedOrder.order_number || selectedOrder.id.slice(0, 8)} • Delivery Record
              </h3>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setSelectedOrder(null)}
              >
                ✕
              </button>
            </div>

            {/* Delivery Photo */}
            {getDeliveryPhoto(selectedOrder) && (
              <div>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 6px', fontWeight: 600 }}>
                  CONTACTLESS DELIVERY PHOTO PROOF:
                </p>
                <div style={{ position: 'relative', width: '100%', height: '240px' }}>
                  <Image
                    src={getDeliveryPhoto(selectedOrder)!}
                    alt="Delivery Proof"
                    fill
                    className={styles.proofPhoto}
                    unoptimized
                  />
                </div>
              </div>
            )}

            {/* Order Details Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
                background: '#131d35',
                padding: '12px',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid #1e293b',
                fontSize: 'var(--text-xs)',
              }}
            >
              <div>
                <span style={{ color: '#94a3b8', display: 'block' }}>Customer:</span>
                <strong style={{ color: '#ffffff' }}>{selectedOrder.customer?.full_name || 'Customer'}</strong>
                <div style={{ color: '#64748b', fontSize: '11px' }}>{selectedOrder.customer?.phone}</div>
              </div>
              <div>
                <span style={{ color: '#94a3b8', display: 'block' }}>Drop Destination:</span>
                <strong style={{ color: '#ffffff' }}>
                  {selectedOrder.address?.street} {selectedOrder.address?.unit}
                </strong>
                <div style={{ color: '#64748b', fontSize: '11px' }}>
                  {selectedOrder.address?.city}, {selectedOrder.address?.state} {selectedOrder.address?.zip}
                </div>
              </div>
              <div>
                <span style={{ color: '#94a3b8', display: 'block' }}>Delivered Time:</span>
                <strong style={{ color: '#10b981' }}>
                  {formatTimestamp(selectedOrder.events?.find((e) => e.status === 'delivered')?.timestamp || selectedOrder.updated_at)}
                </strong>
              </div>
              <div>
                <span style={{ color: '#94a3b8', display: 'block' }}>Handled By Driver:</span>
                <strong style={{ color: '#ffffff' }}>{getDriverDisplay(selectedOrder)}</strong>
              </div>
              <div>
                <span style={{ color: '#94a3b8', display: 'block' }}>Total Paid:</span>
                <strong style={{ color: 'var(--color-gold)' }}>
                  ${Number(selectedOrder.total || 0).toFixed(2)}
                </strong>
              </div>
              <div>
                <span style={{ color: '#94a3b8', display: 'block' }}>Drop Spot Note:</span>
                <span style={{ color: '#e2e8f0' }}>{selectedOrder.address?.delivery_notes || 'Front Porch / Concierge'}</span>
              </div>
            </div>

            {/* Itemized lines if available */}
            {selectedOrder.items && selectedOrder.items.length > 0 && (
              <div>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 6px', fontWeight: 600 }}>
                  ITEMIZED CLEANING LINES:
                </p>
                <div style={{ background: '#1e293b', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                  {selectedOrder.items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '11px',
                        padding: '4px 0',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      }}
                    >
                      <span>
                        {item.quantity}x {item.garment_type} ({item.service_type})
                      </span>
                      <span style={{ color: 'var(--color-gold)', fontWeight: 600 }}>
                        ${Number(item.subtotal || 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                className={styles.proofBtn}
                onClick={() => setSelectedOrder(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
