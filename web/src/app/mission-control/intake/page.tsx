'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useIntakeQueue } from '@/hooks/useIntake';
import { Button, Badge, Loader, Modal, RefreshButton } from '@/components/ui';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/lib/constants';
import { IntakeTicketWorkspace } from '@/components/mission-control';
import styles from './page.module.css';

export default function CentralIntakePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { data, isLoading, error, refetch } = useIntakeQueue();
  const queue = useMemo(() => data?.queue || [], [data?.queue]);
  const intakeHistory = useMemo(() => data?.intakeHistory || [], [data?.intakeHistory]);
  const todayIntakeCount = data?.todayIntakeCount || 0;
  const [activeQueueTab, setActiveQueueTab] = useState<'queue' | 'history'>('queue');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Expanded Zoom Photo Modal
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null);

  const displayList = activeQueueTab === 'queue' ? queue : intakeHistory;
  const selectedOrder = displayList.find((o) => o.id === selectedOrderId) || displayList[0] || null;

  return (
    <AuthGuard allowedRoles={['admin', 'intake_staff']}>
      <div className={styles.page}>
        <div className={styles.container}>
          {/* Header */}
          <div className={styles.headerRow}>
            <div className={styles.brandArea}>
              <Image
                src="/icon.webp"
                alt="First Eleven"
                width={42}
                height={42}
                style={{ borderRadius: '8px', objectFit: 'cover' }}
              />
              <div>
                <h1 className={styles.title}>Central Intake Station</h1>
                <p className={styles.subtitle}>Digital Weighing, Garment Passport Itemization &amp; Photo Verification</p>
              </div>
            </div>
            <div className={styles.navLinks}>
              <RefreshButton
                onRefresh={refetch}
                size="sm"
                variant="glass"
              />
              {isAdmin ? (
                <>
                  <Link href={ROUTES.missionControl}>
                    <Button variant="outlineLight" size="sm">
                      ← Mission Control Ops
                    </Button>
                  </Link>
                  <Link href={`${ROUTES.dashboard}?view=customer`}>
                    <Button variant="ghostLight" size="sm">
                      Customer View
                    </Button>
                  </Link>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Badge variant="delivered" size="md">
                    ⚖️ Today&apos;s Inspected: {todayIntakeCount} Bags
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {isLoading ? (
            <Loader text="Loading plant intake queue..." />
          ) : (
            <div className={styles.workspaceGrid}>
              {/* Left Queue Column */}
              <div className={styles.queueCol}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: 'var(--space-3)' }}>
                  <button
                    type="button"
                    onClick={() => { setActiveQueueTab('queue'); setSelectedOrderId(null); }}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 'bold',
                      border: 'none',
                      cursor: 'pointer',
                      background: activeQueueTab === 'queue' ? 'var(--color-gold)' : 'rgba(255,255,255,0.06)',
                      color: activeQueueTab === 'queue' ? '#0f172a' : '#94a3b8',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Queue ({queue.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveQueueTab('history'); setSelectedOrderId(null); }}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 'bold',
                      border: 'none',
                      cursor: 'pointer',
                      background: activeQueueTab === 'history' ? 'var(--color-gold)' : 'rgba(255,255,255,0.06)',
                      color: activeQueueTab === 'history' ? '#0f172a' : '#94a3b8',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    History ({intakeHistory.length})
                  </button>
                </div>

                <div className={styles.queueHeader}>
                  <span>{activeQueueTab === 'queue' ? 'Awaiting Intake' : 'Processed Intake'}</span>
                  <Badge variant={activeQueueTab === 'queue' ? 'warning' : 'delivered'}>
                    {activeQueueTab === 'queue' ? `${queue.length} Ready` : `${todayIntakeCount} Today`}
                  </Badge>
                </div>

                <div className={styles.queueList}>
                  {error ? (
                    <div
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid #EF4444',
                        borderRadius: 'var(--radius-md)',
                        padding: '12px',
                        color: '#FCA5A5',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      <strong style={{ display: 'block', color: '#F87171', marginBottom: '4px' }}>
                        ⚠️ Queue Authorization Issue
                      </strong>
                      {(error as Error).message}
                    </div>
                  ) : displayList.length === 0 ? (
                    <p style={{ fontSize: 'var(--text-xs)', color: '#cbd5e1', lineHeight: '1.5' }}>
                      {activeQueueTab === 'queue'
                        ? 'No incoming bags awaiting intake. Bags will appear here as soon as drivers confirm pickup.'
                        : 'No orders processed through intake yet today.'}
                    </p>
                  ) : (
                    displayList.map((order) => {
                      const isSelected = selectedOrder?.id === order.id;
                      const orderNum = order.order_number || order.id.slice(0, 8);
                      return (
                        <button
                          key={order.id}
                          type="button"
                          className={`${styles.queueCard} ${isSelected ? styles.queueCardActive : ''}`}
                          onClick={() => setSelectedOrderId(order.id)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                            <span className={styles.queueCardNum}>#{orderNum}</span>
                            {activeQueueTab === 'history' && order.updated_at && (
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                {new Date(order.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} • {new Date(order.updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                              </span>
                            )}
                          </div>
                          <span className={styles.queueCustomer}>{order.customer?.full_name || 'Customer'}</span>
                          <span className={styles.queueMeta}>
                            {order.order_type.toUpperCase()} • {order.weight_lbs ? `${order.weight_lbs} lbs` : '—'} • {order.status.replace('_', ' ')}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Active Workspace Column */}
              <div style={{ flex: 1 }}>
                {error ? (
                  <div style={{ padding: '60px', textAlign: 'center', background: '#1e293b', borderRadius: 'var(--radius-2xl)', color: '#F87171' }}>
                    <strong style={{ display: 'block', fontSize: 'var(--text-base)', marginBottom: '8px' }}>Queue Authorization Blocked</strong>
                    {(error as Error).message}
                  </div>
                ) : selectedOrder ? (
                  <IntakeTicketWorkspace
                    key={selectedOrder.id}
                    order={selectedOrder}
                    onIntakeCompleted={(newStatus) => {
                      selectedOrder.status = newStatus;
                    }}
                    onZoomPhoto={(url) => setZoomPhotoUrl(url)}
                  />
                ) : (
                  <div style={{ padding: '60px', textAlign: 'center', background: '#1e293b', borderRadius: 'var(--radius-2xl)', color: '#cbd5e1' }}>
                    Select an order from the queue on the left to begin intake check.
                  </div>
                )}
              </div>
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
    </AuthGuard>
  );
}
