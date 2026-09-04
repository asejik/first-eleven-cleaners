'use client';

import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui';
import { ORDER_STATUS_MAP, type OrderStatusKey } from '@/lib/constants';
import type { Order } from '@/types';
import styles from '@/app/mission-control/page.module.css';

interface KanbanBoardProps {
  stages: OrderStatusKey[];
  orders: Order[];
  onAdvance: (orderId: string, currentStage: OrderStatusKey) => void;
  isAdvancing: boolean;
  onViewArchive?: () => void;
}

function formatOrderDate(o: Order, stage: OrderStatusKey): { dateText: string; timeText?: string } {
  if (stage === 'delivered') {
    const deliveredEvent = o.events?.find((e) => e.status === 'delivered');
    const ts = deliveredEvent?.timestamp || o.updated_at;
    if (ts) {
      const d = new Date(ts);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const isYesterday = d.toDateString() === yesterday.toDateString();

      const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
      if (isToday) return { dateText: 'Today', timeText: timeStr };
      if (isYesterday) return { dateText: 'Yesterday', timeText: timeStr };
      return {
        dateText: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        timeText: timeStr,
      };
    }
  }

  // Active stages:
  const dateStr = o.pickup_date || (o.created_at ? o.created_at.split('T')[0] : '');
  const timeSlot = o.pickup_window === 'morning' ? '7:30–10AM' : o.pickup_window === 'evening' ? '5–8PM' : '';

  if (dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const label = isToday ? 'Today' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return { dateText: label, timeText: timeSlot || undefined };
  }

  return { dateText: 'Scheduled' };
}

function getDriverFirstName(order: Order): string | null {
  const deliveredEvent = order.events?.find((e) => e.status === 'delivered');
  if (!deliveredEvent?.triggered_by) return null;
  const raw = deliveredEvent.triggered_by;
  const match = raw.match(/Driver \((.*?)(?:\[.*\])?\)/);
  if (match && match[1]) {
    const cleaned = match[1].replace(/\s*\(Lead DFW Driver\)/i, '').trim();
    return cleaned.split(/\s+/)[0];
  }
  return null;
}

export function KanbanBoard({
  stages,
  orders,
  onAdvance,
  isAdvancing,
  onViewArchive,
}: KanbanBoardProps) {
  const [isDeliveredCollapsed, setIsDeliveredCollapsed] = useState(false);
  const [deliveredScope, setDeliveredScope] = useState<'today' | 'all'>('today');

  // Separate active WIP stages from delivered terminal state
  const activeStages = useMemo(() => {
    return stages.filter((s) => s !== 'delivered');
  }, [stages]);

  const hasDeliveredStage = stages.includes('delivered');

  // All delivered orders
  const allDeliveredOrders = useMemo(() => {
    return orders.filter((o) => o.status === 'delivered');
  }, [orders]);

  // Today delivered orders
  const todayStr = new Date().toISOString().split('T')[0];
  const todayDeliveredOrders = useMemo(() => {
    return allDeliveredOrders.filter((o) => {
      const deliveredEvent = o.events?.find((e) => e.status === 'delivered');
      const ts = deliveredEvent?.timestamp || o.updated_at;
      return ts ? ts.startsWith(todayStr) : false;
    });
  }, [allDeliveredOrders, todayStr]);

  // Orders currently displayed in the Delivered column
  const displayedDelivered = deliveredScope === 'today' ? todayDeliveredOrders : allDeliveredOrders;

  return (
    <div>
      {/* Board Header with operational summary */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'bold', color: '#ffffff', margin: 0 }}>
            Live Operations Board
          </h2>
          <span
            style={{
              background: '#131d35',
              border: '1px solid #1e293b',
              borderRadius: 'var(--radius-full)',
              padding: '2px 10px',
              fontSize: '11px',
              color: '#38bdf8',
              fontWeight: 600,
            }}
          >
            5 Active WIP Stages • {orders.filter((o) => o.status !== 'delivered').length} Active Orders
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onViewArchive && (
            <button
              type="button"
              onClick={onViewArchive}
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34d399',
                borderRadius: 'var(--radius-full)',
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span>📦</span>
              <span>Delivered Archive ({allDeliveredOrders.length}) ➔</span>
            </button>
          )}

          <span style={{ fontSize: 'var(--text-xs)', color: '#94a3b8' }}>
            Auto-refreshing every 15s • Click Advance to push stage & SMS
          </span>
        </div>
      </div>

      {/* Kanban Grid */}
      <div className={isDeliveredCollapsed ? styles.kanbanBoardCollapsed : styles.kanbanBoard}>
        {/* Active Work-In-Progress Columns (Booked to Out for Delivery) */}
        {activeStages.map((stage) => {
          const stageOrders = orders.filter((o) => o.status === stage);
          const stageMeta = ORDER_STATUS_MAP[stage];

          return (
            <div key={stage} className={styles.kanbanCol}>
              <div className={styles.kanbanColHeader}>
                <div className={styles.colHeaderLeft}>
                  <span className={styles.colTitle}>{stageMeta?.label || stage}</span>
                </div>
                <span className={styles.colCount}>{stageOrders.length}</span>
              </div>

              <div className={styles.orderList}>
                {stageOrders.length === 0 ? (
                  <p style={{ fontSize: 'var(--text-2xs)', color: '#64748b', textAlign: 'center', padding: '32px 0' }}>
                    No orders in this stage
                  </p>
                ) : (
                  stageOrders.map((o: Order) => {
                    const orderNum = o.order_number || o.id.slice(0, 8);
                    const customerName = o.customer?.full_name || 'Customer';
                    const { dateText, timeText } = formatOrderDate(o, stage);

                    return (
                      <div key={o.id} className={styles.orderCard}>
                        <div className={styles.orderCardHead}>
                          <span className={styles.orderNum}>#{orderNum}</span>
                          <Badge variant="cleaning">{o.order_type.toUpperCase()}</Badge>
                        </div>

                        <h3 className={styles.orderCustomer}>{customerName}</h3>

                        <div className={styles.orderMeta}>
                          <span className={styles.orderDate} title={`${dateText} ${timeText || ''}`}>
                            📅 {dateText} {timeText ? `(${timeText})` : ''}
                          </span>
                          <span style={{ fontWeight: 600, color: 'var(--color-gold)' }}>
                            {o.total ? `$${Number(o.total).toFixed(2)}` : 'Estimating'}
                          </span>
                        </div>

                        <button
                          type="button"
                          className={styles.advanceBtn}
                          onClick={() => onAdvance(o.id, stage)}
                          disabled={isAdvancing}
                        >
                          Advance to Next Stage ➔
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}

        {/* Delivered Column (Terminal Archival State) */}
        {hasDeliveredStage && (
          isDeliveredCollapsed ? (
            /* Collapsed State: Vertical Summary Pill */
            <div
              className={styles.collapsedDeliveredCol}
              onClick={() => setIsDeliveredCollapsed(false)}
              title="Click to expand Delivered column"
            >
              <button
                type="button"
                className={styles.collapsedExpandBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDeliveredCollapsed(false);
                }}
                aria-label="Expand Delivered Column"
              >
                ◀
              </button>
              <span className={styles.collapsedBadge}>{displayedDelivered.length}</span>
              <span className={styles.verticalText}>
                Delivered ({displayedDelivered.length})
              </span>
            </div>
          ) : (
            /* Expanded State: Scoped & Scrollable */
            <div className={`${styles.kanbanCol} ${styles.kanbanColDelivered}`}>
              {/* Column Header */}
              <div className={styles.kanbanColHeader}>
                <div className={styles.colHeaderLeft}>
                  <span className={styles.colTitle} style={{ color: '#34d399' }}>
                    Delivered
                  </span>
                  <span className={`${styles.colCount} ${styles.colCountDelivered}`}>
                    {displayedDelivered.length}
                  </span>
                </div>

                <button
                  type="button"
                  className={styles.collapseToggleBtn}
                  onClick={() => setIsDeliveredCollapsed(true)}
                  title="Collapse Delivered column to save space"
                >
                  <span>Collapse</span>
                  <span>▶</span>
                </button>
              </div>

              {/* Today vs All Filter Switcher */}
              <div className={styles.scopeFilterRow}>
                <button
                  type="button"
                  className={`${styles.scopeBtn} ${deliveredScope === 'today' ? styles.scopeBtnActive : ''}`}
                  onClick={() => setDeliveredScope('today')}
                >
                  Today ({todayDeliveredOrders.length})
                </button>
                <button
                  type="button"
                  className={`${styles.scopeBtn} ${deliveredScope === 'all' ? styles.scopeBtnActive : ''}`}
                  onClick={() => setDeliveredScope('all')}
                >
                  All ({allDeliveredOrders.length})
                </button>
              </div>

              {/* Scrollable Order List (Bounded height) */}
              <div className={styles.orderList}>
                {displayedDelivered.length === 0 ? (
                  <p style={{ fontSize: 'var(--text-2xs)', color: '#64748b', textAlign: 'center', padding: '32px 0' }}>
                    {deliveredScope === 'today' ? 'No orders delivered today yet' : 'No delivered orders'}
                  </p>
                ) : (
                  displayedDelivered.map((o: Order) => {
                    const orderNum = o.order_number || o.id.slice(0, 8);
                    const customerName = o.customer?.full_name || 'Customer';
                    const { dateText, timeText } = formatOrderDate(o, 'delivered');
                    const driverName = getDriverFirstName(o);

                    return (
                      <div key={o.id} className={`${styles.orderCard} ${styles.orderCardDelivered}`}>
                        <div className={styles.orderCardHead}>
                          <span className={styles.orderNum}>#{orderNum}</span>
                          <Badge variant="delivered">{o.order_type.toUpperCase()}</Badge>
                        </div>

                        <h3 className={styles.orderCustomer}>{customerName}</h3>

                        <div className={styles.orderMeta}>
                          <span className={styles.orderDate} title={`${dateText} • ${timeText || ''}`}>
                            📅 {dateText} {timeText ? `(${timeText})` : ''}
                          </span>
                          <span style={{ fontWeight: 600, color: 'var(--color-gold)' }}>
                            {o.total ? `$${Number(o.total).toFixed(2)}` : '—'}
                          </span>
                        </div>

                        {driverName && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                            <span className={styles.driverAttribution}>
                              🚐 {driverName}
                            </span>
                            <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 600 }}>
                              ✓ Completed
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Column Footer: Link to Full Archive */}
              {onViewArchive && (
                <div className={styles.deliveredColFooter}>
                  <button
                    type="button"
                    className={styles.archiveLinkBtn}
                    onClick={onViewArchive}
                  >
                    <span>📦</span>
                    <span>Browse All Archive ({allDeliveredOrders.length}) ➔</span>
                  </button>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
