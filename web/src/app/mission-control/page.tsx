'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useMissionControl, useAdvanceOrderStage, useResolveClaim } from '@/hooks/useMissionControl';
import { useNotifications, useDispatchNotification } from '@/hooks/useNotifications';
import { Button, Badge, Loader, Modal } from '@/components/ui';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useUIStore } from '@/stores/ui-store';
import { ORDER_STATUS_MAP, type OrderStatusKey } from '@/lib/constants';
import type { Order, Claim } from '@/types';
import styles from './page.module.css';

const STAGES: OrderStatusKey[] = [
  'booked',
  'picked_up',
  'weighed_itemized',
  'in_cleaning',
  'out_for_delivery',
  'delivered',
];

export default function MissionControlPage() {
  const { data, isLoading } = useMissionControl();
  const advanceStage = useAdvanceOrderStage();
  const resolveClaim = useResolveClaim();
  const { data: notifsData } = useNotifications();
  const dispatchNotif = useDispatchNotification();
  const addToast = useUIStore((s) => s.addToast);

  // Claim resolution modal
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [refundAmount, setRefundAmount] = useState<string>('');

  // Simulator test message state
  const [testStage, setTestStage] = useState<OrderStatusKey>('booked');
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);

  const orders = data?.orders || [];
  const stats = data?.stats;
  const claims = data?.claims || [];
  const notifications = notifsData?.notifications || [];

  const handleAdvance = async (orderId: string, currentStage: OrderStatusKey) => {
    const currentIndex = STAGES.indexOf(currentStage);
    if (currentIndex < STAGES.length - 1) {
      const nextStage = STAGES[currentIndex + 1];
      try {
        await advanceStage.mutateAsync({ order_id: orderId, new_stage: nextStage });
        addToast({
          type: 'success',
          title: 'Stage Advanced',
          message: `Order advanced to ${ORDER_STATUS_MAP[nextStage]?.label || nextStage} & customer notified.`,
        });
      } catch (err: unknown) {
        addToast({
          type: 'error',
          title: 'Advance Failed',
          message: (err as Error).message,
        });
      }
    }
  };

  const handleResolveClaimSubmit = async () => {
    if (!selectedClaim) return;
    try {
      await resolveClaim.mutateAsync({
        claim_id: selectedClaim.id,
        resolution_notes: resolutionText || 'Resolved under 100% Make It Right guarantee.',
        refund_amount: refundAmount ? parseFloat(refundAmount) : null,
        claim_status: refundAmount ? 'refunded' : 'resolved',
      });

      addToast({
        type: 'success',
        title: 'Claim Resolved',
        message: `Claim #${selectedClaim.id.slice(0, 8)} updated with Executive Resolution.`,
      });

      setSelectedClaim(null);
      setResolutionText('');
      setRefundAmount('');
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Resolution Failed',
        message: (err as Error).message,
      });
    }
  };

  const handleManualTestNotification = async (orderId: string) => {
    try {
      await dispatchNotif.mutateAsync({
        order_id: orderId,
        stage: testStage,
      });
      addToast({
        type: 'info',
        title: 'Notification Dispatched',
        message: `Dispatched test message for ${testStage} stage.`,
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Dispatch Failed',
        message: (err as Error).message,
      });
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailRecipient.trim()) {
      addToast({
        type: 'error',
        title: 'Email Required',
        message: 'Please enter your email address to test Resend.',
      });
      return;
    }

    setIsSendingTestEmail(true);
    try {
      const res = await fetch('/api/notifications/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_email: testEmailRecipient.trim(),
          customer_name: 'DFW Customer',
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to dispatch test email.');
      }

      addToast({
        type: 'success',
        title: 'Email Dispatched via Resend!',
        message: `Test email successfully sent to ${testEmailRecipient.trim()}. Check your inbox!`,
      });
      setTestEmailRecipient('');
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Resend Test Failed',
        message: (err as Error).message,
      });
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  return (
    <AuthGuard allowedRoles={['admin']}>
      <div className={styles.page}>
        <div className={styles.container}>
        {/* Top Header */}
        <div className={styles.topBar}>
          <div className={styles.brandCol}>
            <Image
              src="/icon.png"
              alt="First Eleven"
              width={44}
              height={44}
              style={{ borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
            />
            <div>
              <h1 className={styles.title}>Mission Control Ops</h1>
              <p className={styles.subtitle}>
                Dallas Plant & Fleet Command • FIFA 2026 World Cup Heritage Standard
              </p>
            </div>
          </div>
          <div className={styles.topActions}>
            <Link href="/mission-control/intake">
              <Button variant="primary" size="sm">
                ⚖️ Central Intake Station
              </Button>
            </Link>
            <Link href="/staff/driver">
              <Button variant="outlineLight" size="sm">
                🚐 Driver Mobile App
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="ghostLight" size="sm">
                Customer View
              </Button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <Loader text="Loading live operations data..." />
        ) : (
          <>
            {/* KPI Strip */}
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Active Plant Volume</span>
                <span className={styles.kpiValue}>{stats?.active_count ?? 0} Orders</span>
                <span className={styles.kpiSub}>{stats?.total_count ?? 0} all-time orders recorded</span>
              </div>

              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Today&apos;s Estimated Sales</span>
                <span className={styles.kpiValue}>${(stats?.today_revenue ?? 0).toFixed(2)}</span>
                <span className={styles.kpiSub}>Total Plant Volume: {stats?.total_lbs ?? 0} lbs</span>
              </div>

              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Dry Clean Pieces</span>
                <span className={styles.kpiValue}>{stats?.total_pieces ?? 0} Garments</span>
                <span className={styles.kpiSub}>Inspected & hand-pressed</span>
              </div>

              {/* Real-Time Labor Benchmark */}
              <div className={styles.laborBarCard}>
                <div className={styles.laborBarHeader}>
                  <span className={styles.kpiLabel}>Labor Benchmark Target</span>
                  <Badge variant={stats?.labor.status === 'optimal' ? 'success' : 'error'}>
                    {stats?.labor.current_pct}% (Max: {stats?.labor.target_max_pct}%)
                  </Badge>
                </div>
                <div className={styles.laborTrack}>
                  <div
                    className={`${styles.laborFill} ${
                      stats?.labor.status === 'optimal' ? styles.laborFillOptimal : styles.laborFillAlert
                    }`}
                    style={{ width: `${Math.min(100, (stats?.labor.current_pct ?? 28) * 2)}%` }}
                  />
                </div>
                <span className={styles.kpiSub}>
                  Est. Labor: ${(stats?.labor.estimated_cost ?? 0).toFixed(2)} • Labor ≤ 32% of net sales
                </span>
              </div>
            </div>

            {/* 6-Stage Interactive Kanban Board */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'bold', color: '#ffffff', margin: 0 }}>
                  Live Operations Board (6 Stages)
                </h2>
                <span style={{ fontSize: 'var(--text-xs)', color: '#94a3b8' }}>
                  Auto-refreshing every 15s • Click Advance to push stage & SMS
                </span>
              </div>

              <div className={styles.kanbanBoard}>
                {STAGES.map((stage) => {
                  const stageOrders = orders.filter((o) => o.status === stage);
                  const stageMeta = ORDER_STATUS_MAP[stage];

                  return (
                    <div key={stage} className={styles.kanbanCol}>
                      <div className={styles.kanbanColHeader}>
                        <span className={styles.colTitle}>{stageMeta?.label || stage}</span>
                        <span className={styles.colCount}>{stageOrders.length}</span>
                      </div>

                      <div className={styles.orderList}>
                        {stageOrders.length === 0 ? (
                          <p style={{ fontSize: 'var(--text-2xs)', color: '#64748b', textAlign: 'center', padding: '24px 0' }}>
                            No orders in this stage
                          </p>
                        ) : (
                          stageOrders.map((o: Order) => {
                            const orderNum = o.order_number || o.id.slice(0, 8);
                            const customerName = o.customer?.full_name || 'Customer';
                            return (
                              <div key={o.id} className={styles.orderCard}>
                                <div className={styles.orderCardHead}>
                                  <span className={styles.orderNum}>#{orderNum}</span>
                                  <Badge variant={stage === 'delivered' ? 'delivered' : 'cleaning'}>
                                    {o.order_type.toUpperCase()}
                                  </Badge>
                                </div>

                                <h3 className={styles.orderCustomer}>{customerName}</h3>

                                <div className={styles.orderMeta}>
                                  <span>📅 {o.pickup_date}</span>
                                  <span>{o.total ? `$${o.total.toFixed(2)}` : 'Estimating'}</span>
                                </div>

                                {stage !== 'delivered' && (
                                  <button
                                    type="button"
                                    className={styles.advanceBtn}
                                    onClick={() => handleAdvance(o.id, stage)}
                                    disabled={advanceStage.isPending}
                                  >
                                    Advance to Next Stage ➔
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Grid: Make It Right Claims + Live Notification Simulator */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
              {/* Claims Queue */}
              <div className={styles.sectionBlock}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>
                    <span>🛡️</span> Make It Right Resolution Queue ({claims.length})
                  </h3>
                </div>

                {claims.length === 0 ? (
                  <p style={{ fontSize: 'var(--text-xs)', color: '#94a3b8' }}>
                    ✨ Zero open claims. All customer pickups in perfect standing.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {claims.map((claim) => (
                      <div
                        key={claim.id}
                        style={{
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: 'var(--radius-lg)',
                          padding: '12px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', color: 'var(--color-gold)' }}>
                              Claim #{claim.id.slice(0, 8)}
                            </span>
                            <Badge variant={claim.status === 'resolved' || claim.status === 'refunded' ? 'success' : 'warning'}>
                              {claim.status.toUpperCase()}
                            </Badge>
                          </div>
                          <p style={{ fontSize: 'var(--text-xs)', color: '#f1f5f9', margin: '4px 0 2px' }}>
                            <strong>Issue:</strong> {claim.issue_type.toUpperCase()} • &ldquo;{claim.description}&rdquo;
                          </p>
                          <span style={{ fontSize: 'var(--text-2xs)', color: '#94a3b8' }}>
                            Order #{claim.order?.order_number || claim.order_id?.slice(0, 8)} • Customer: {claim.customer?.full_name}
                          </span>
                        </div>

                        {claim.status === 'open' && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setSelectedClaim(claim);
                              setResolutionText(claim.resolution_notes || '');
                              setRefundAmount(claim.refund_amount ? String(claim.refund_amount) : '');
                            }}
                          >
                            Resolve / Refund
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Commercial B2B & Growth Retention Operations */}
              <div className={styles.sectionBlock}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>
                    <span>🏢</span> Commercial B2B Accounts & Growth Automations
                  </h3>
                  <Badge variant="success">3 Enterprise Facilities</Badge>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  <div style={{ background: '#1e293b', padding: '14px', borderRadius: 'var(--radius-lg)', border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)' }}>Commercial B2B Volume</strong>
                      <Badge variant="info">Net-30</Badge>
                    </div>
                    <p style={{ fontSize: 'var(--text-sm)', color: '#ffffff', fontWeight: 'bold', margin: '0 0 2px' }}>
                      2,720 lbs Linen & Guest Valet
                    </p>
                    <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '10px' }}>
                      The Joule Hotel, HP MedSpa, Equinox Plano
                    </span>
                    <Link href="/portal">
                      <Button variant="outlineLight" size="sm" fullWidth>
                        Open B2B Enterprise Portal →
                      </Button>
                    </Link>
                  </div>

                  <div style={{ background: '#1e293b', padding: '14px', borderRadius: 'var(--radius-lg)', border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <strong style={{ fontSize: 'var(--text-xs)', color: '#4ade80' }}>Growth & Review Booster</strong>
                      <Badge variant="delivered">4.95 ⭐ Rating</Badge>
                    </div>
                    <p style={{ fontSize: 'var(--text-sm)', color: '#ffffff', fontWeight: 'bold', margin: '0 0 2px' }}>
                      Automated 2-Hr Review Prompt
                    </p>
                    <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '10px' }}>
                      Google Review Booster + Churn Win-Back (COMEBACK15)
                    </span>
                    <Badge variant="booked">Automations Active</Badge>
                  </div>
                </div>
              </div>

              {/* Live SMS & WhatsApp Simulator HUD */}
              <div className={styles.sectionBlock}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>
                    <span>📱</span> Real-Time SMS & WhatsApp Simulator HUD
                  </h3>
                  <Badge variant="info">Plug & Play Ready</Badge>
                </div>

                <p style={{ fontSize: 'var(--text-xs)', color: '#94a3b8', margin: 0 }}>
                  Audit log of outgoing status messages dispatched to customers via Simulated Provider or Live Twilio.
                </p>

                {/* Live Resend Email Tester */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#131d35', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-gold)', fontWeight: 'bold' }}>
                      📧 Test Live Resend Email Dispatch (RESEND_API_KEY):
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="email"
                      placeholder="Enter your test email (e.g. you@example.com)"
                      value={testEmailRecipient}
                      onChange={(e) => setTestEmailRecipient(e.target.value)}
                      style={{ flex: 1, padding: '6px 10px', fontSize: 'var(--text-xs)', background: '#1e293b', color: '#ffffff', border: '1px solid #475569', borderRadius: '4px' }}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSendTestEmail}
                      isLoading={isSendingTestEmail}
                    >
                      ✉️ Send Test Email
                    </Button>
                  </div>
                </div>

                {/* Quick Dispatch Test Trigger */}
                {orders.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#131d35', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
                    <span style={{ fontSize: 'var(--text-2xs)', color: '#cbd5e1' }}>Test SMS/WhatsApp:</span>
                    <select
                      value={testStage}
                      onChange={(e) => setTestStage(e.target.value as OrderStatusKey)}
                      style={{ background: '#1e293b', color: '#ffffff', border: '1px solid #475569', borderRadius: '4px', fontSize: 'var(--text-xs)', padding: '4px' }}
                    >
                      {STAGES.map((st) => (
                        <option key={st} value={st}>
                          {ORDER_STATUS_MAP[st]?.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outlineLight"
                      size="sm"
                      onClick={() => handleManualTestNotification(orders[0].id)}
                      disabled={dispatchNotif.isPending}
                    >
                      Send to Order #{orders[0].order_number || orders[0].id.slice(0, 8)}
                    </Button>
                  </div>
                )}

                <div className={styles.messagesFeed}>
                  {notifications.length === 0 ? (
                    <p style={{ fontSize: 'var(--text-2xs)', color: '#64748b', textAlign: 'center', padding: '20px 0' }}>
                      No messages dispatched yet. Advance an order stage or run intake to trigger alerts.
                    </p>
                  ) : (
                    notifications.map((msg) => {
                      const isEscalation = msg.text.includes('[AI CONCIERGE ESCALATION]');
                      return (
                        <div
                          key={msg.id}
                          className={styles.msgBubble}
                          style={isEscalation ? { border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)' } : undefined}
                        >
                          <div className={styles.msgMeta}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>
                                {msg.channel === 'whatsapp' ? '🟢 WhatsApp' : '💬 SMS'} ➔ {msg.customer_name} ({msg.customer_phone})
                              </span>
                              {isEscalation && <Badge variant="error">🚨 AI Escalation</Badge>}
                            </div>
                            <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className={styles.msgText}>{msg.text}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Claim Resolution Modal */}
        <Modal
          isOpen={Boolean(selectedClaim)}
          onClose={() => setSelectedClaim(null)}
          title={`🛡️ Resolve Claim #${selectedClaim?.id.slice(0, 8)}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-navy)', margin: 0 }}>
              Provide an Executive Resolution Response and optional instant refund under our 100% Make It Right Guarantee.
            </p>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
                Resolution Action Type
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setResolutionText('We have arranged a complimentary re-cleaning & hand-pressing of your garment at zero charge.');
                    setRefundAmount('');
                  }}
                  style={{ padding: '8px 4px', fontSize: '11px', fontWeight: 'bold', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', cursor: 'pointer' }}
                >
                  🔄 Free Re-Clean
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResolutionText('We sincerely apologize for the inconvenience. A full refund has been credited to your payment method.');
                    setRefundAmount('45.00');
                  }}
                  style={{ padding: '8px 4px', fontSize: '11px', fontWeight: 'bold', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', cursor: 'pointer' }}
                >
                  💰 Monetary Refund
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResolutionText('Thank you for bringing this to our attention. We have updated your garment profile notes.');
                    setRefundAmount('');
                  }}
                  style={{ padding: '8px 4px', fontSize: '11px', fontWeight: 'bold', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', cursor: 'pointer' }}
                >
                  💬 Care Explanation
                </button>
              </div>

              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                Executive Resolution Response (Visible to Customer)
              </label>
              <textarea
                value={resolutionText}
                onChange={(e) => setResolutionText(e.target.value)}
                placeholder="e.g. We deeply apologize. We have re-treated this garment and credited your account."
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-gray-300)',
                  fontSize: 'var(--text-sm)',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                Optional Refund Amount ($ USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="Optional e.g. 45.00 (leave blank for non-monetary resolution)"
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
              <Button variant="ghost" onClick={() => setSelectedClaim(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleResolveClaimSubmit}
                isLoading={resolveClaim.isPending}
              >
                Post Executive Resolution
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
    </AuthGuard>
  );
}
