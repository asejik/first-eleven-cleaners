'use client';

import { useState } from 'react';
import { useMissionControl, useAdvanceOrderStage, useResolveClaim } from '@/hooks/useMissionControl';
import { useNotifications, useDispatchNotification } from '@/hooks/useNotifications';
import { Loader } from '@/components/ui';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useUIStore } from '@/stores/ui-store';
import { ORDER_STATUS_MAP, type OrderStatusKey } from '@/lib/constants';
import type { Claim } from '@/types';
import {
  OpsHeader,
  KPIStrip,
  KanbanBoard,
  DeliveredArchive,
  ClaimsQueue,
  ClaimResolutionModal,
  CommercialAndGrowth,
  NotificationSimulator,
  StaffRoster,
  FinancialsLedger,
  ExpressGovernance,
  ZoneGovernance,
} from '@/components/mission-control';
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
  const [activeTab, setActiveTab] = useState<'pipeline' | 'financials' | 'roster' | 'claims' | 'growth' | 'dispatch' | 'express' | 'zones'>('pipeline');
  const [pipelineSubView, setPipelineSubView] = useState<'board' | 'archive'>('board');
  const { data, isLoading, refetch } = useMissionControl();
  const advanceStage = useAdvanceOrderStage();
  const resolveClaim = useResolveClaim();
  const { data: notifsData } = useNotifications();
  const dispatchNotif = useDispatchNotification();
  const addToast = useUIStore((s) => s.addToast);

  // Claim resolution modal state
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
      const targetOrder = orders.find((o) => o.id === orderId);

      // Payment Guard: Check if payment failed and advancing to cleaning/delivery
      if (
        targetOrder &&
        targetOrder.payment_status === 'failed' &&
        ['in_cleaning', 'out_for_delivery', 'delivered'].includes(nextStage)
      ) {
        const orderNum = targetOrder.order_number || targetOrder.id.slice(0, 8);
        const confirmOverride = window.confirm(
          `⚠️ PAYMENT ALERT: Order #${orderNum} has a FAILED payment status ($${Number(targetOrder.total || 0).toFixed(2)}).\n\nAdvancing to ${ORDER_STATUS_MAP[nextStage]?.label || nextStage} without customer payment requires Manager Override.\n\nDo you want to authorize Manager Override to advance this order anyway?`
        );

        if (!confirmOverride) {
          addToast({
            type: 'info',
            title: 'Advancement Cancelled',
            message: `Order #${orderNum} held in ${ORDER_STATUS_MAP[currentStage]?.label || currentStage} pending customer payment.`,
          });
          return;
        }

        try {
          await advanceStage.mutateAsync({
            order_id: orderId,
            new_stage: nextStage,
            manager_override: true,
            override_reason: 'Manager override authorized on Ops Board',
          });
          addToast({
            type: 'warning',
            title: 'Manager Override Authorized',
            message: `Order #${orderNum} advanced to ${ORDER_STATUS_MAP[nextStage]?.label || nextStage} with unpaid status override.`,
          });
        } catch (err: unknown) {
          addToast({
            type: 'error',
            title: 'Advance Blocked',
            message: (err as Error).message,
          });
        }
        return;
      }

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
          <OpsHeader onRefresh={refetch} />

          {isLoading ? (
            <Loader text="Loading live operations data..." />
          ) : (
            <>
              <KPIStrip stats={stats} />

              {/* Mission Control Operational Navigation Bar */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
                  paddingBottom: '12px',
                  marginBottom: 'var(--space-2)',
                  flexWrap: 'wrap',
                }}
              >
                {[
                  { id: 'pipeline', label: '📋 Order Pipeline', count: orders.length },
                  { id: 'financials', label: '💳 Financials & Transactions' },
                  { id: 'express', label: '⚡ 24-Hr Express Governance', count: orders.filter((o) => o.express_tier === 'express_24hr').length },
                  { id: 'zones', label: '🗺️ Zone Minimums' },
                  { id: 'roster', label: '🚐 Fleet & Staff Roster' },
                  { id: 'claims', label: '🛡️ Claims Queue', count: claims.length },
                  { id: 'growth', label: '🏢 B2B Accounts' },
                  { id: 'dispatch', label: '📡 Messaging Dispatch' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    style={{
                      border: '1px solid',
                      borderColor: activeTab === tab.id ? 'var(--color-gold)' : 'rgba(255, 255, 255, 0.15)',
                      backgroundColor: activeTab === tab.id ? 'var(--color-gold)' : 'rgba(255, 255, 255, 0.05)',
                      color: activeTab === tab.id ? 'var(--color-navy)' : 'var(--color-white)',
                      padding: '8px 16px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>{tab.label}</span>
                    {tab.count !== undefined && (
                      <span
                        style={{
                          backgroundColor: activeTab === tab.id ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.15)',
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '10px',
                        }}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {activeTab === 'pipeline' && (
                <div>
                  {/* Pipeline View Mode Selector */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      marginBottom: '16px',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setPipelineSubView('board')}
                      style={{
                        background: pipelineSubView === 'board' ? '#131d35' : 'transparent',
                        border: '1px solid',
                        borderColor: pipelineSubView === 'board' ? 'var(--color-gold)' : '#334155',
                        color: pipelineSubView === 'board' ? '#ffffff' : '#94a3b8',
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>⚡ Live Active Board</span>
                      <span
                        style={{
                          background: pipelineSubView === 'board' ? 'rgba(201, 161, 74, 0.2)' : '#1e293b',
                          color: pipelineSubView === 'board' ? 'var(--color-gold)' : '#94a3b8',
                          padding: '1px 7px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '10px',
                          fontWeight: 800,
                        }}
                      >
                        {orders.filter((o) => o.status !== 'delivered').length} active
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPipelineSubView('archive')}
                      style={{
                        background: pipelineSubView === 'archive' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                        border: '1px solid',
                        borderColor: pipelineSubView === 'archive' ? '#10b981' : '#334155',
                        color: pipelineSubView === 'archive' ? '#34d399' : '#94a3b8',
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>📦 Delivered & Completed Archive</span>
                      <span
                        style={{
                          background: pipelineSubView === 'archive' ? 'rgba(16, 185, 129, 0.3)' : '#1e293b',
                          color: pipelineSubView === 'archive' ? '#34d399' : '#94a3b8',
                          padding: '1px 7px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '10px',
                          fontWeight: 800,
                        }}
                      >
                        {orders.filter((o) => o.status === 'delivered').length} completed
                      </span>
                    </button>
                  </div>

                  {pipelineSubView === 'board' ? (
                    <KanbanBoard
                      stages={STAGES}
                      orders={orders}
                      onAdvance={handleAdvance}
                      isAdvancing={advanceStage.isPending}
                      onViewArchive={() => setPipelineSubView('archive')}
                    />
                  ) : (
                    <DeliveredArchive
                      orders={orders}
                      onBackToPipeline={() => setPipelineSubView('board')}
                    />
                  )}
                </div>
              )}

              {activeTab === 'financials' && (
                <FinancialsLedger />
              )}

              {activeTab === 'roster' && (
                <StaffRoster />
              )}

              {activeTab === 'claims' && (
                <ClaimsQueue
                  claims={claims}
                  onSelectClaim={(claim) => {
                    setSelectedClaim(claim);
                    setResolutionText(claim.resolution_notes || '');
                    setRefundAmount(claim.refund_amount ? String(claim.refund_amount) : '');
                  }}
                />
              )}

              {activeTab === 'growth' && (
                <CommercialAndGrowth />
              )}

              {activeTab === 'dispatch' && (
                <NotificationSimulator
                  stages={STAGES}
                  orders={orders}
                  notifications={notifications}
                  testStage={testStage}
                  setTestStage={setTestStage}
                  testEmailRecipient={testEmailRecipient}
                  setTestEmailRecipient={setTestEmailRecipient}
                  isSendingTestEmail={isSendingTestEmail}
                  onSendTestEmail={handleSendTestEmail}
                  onManualTestNotification={handleManualTestNotification}
                  isDispatchingNotif={dispatchNotif.isPending}
                />
              )}

              {activeTab === 'express' && (
                <ExpressGovernance
                  orders={orders}
                  onRefresh={refetch}
                  onToast={addToast}
                />
              )}

              {activeTab === 'zones' && (
                <ZoneGovernance
                  orders={orders}
                  onToast={addToast}
                />
              )}
            </>
          )}

          <ClaimResolutionModal
            selectedClaim={selectedClaim}
            onClose={() => setSelectedClaim(null)}
            resolutionText={resolutionText}
            setResolutionText={setResolutionText}
            refundAmount={refundAmount}
            setRefundAmount={setRefundAmount}
            onSubmit={handleResolveClaimSubmit}
            isLoading={resolveClaim.isPending}
          />
        </div>
      </div>
    </AuthGuard>
  );
}
