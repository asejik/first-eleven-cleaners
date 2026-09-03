'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useOrderDetail, useCancelOrder } from '@/hooks/useOrders';
import { useOrderClaims } from '@/hooks/useClaims';
import { useUIStore } from '@/stores/ui-store';
import { Button, Card, Badge, Loader, Modal } from '@/components/ui';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { GarmentPassportTimeline } from '@/components/orders/GarmentPassportTimeline';
import { ORDER_STATUSES, ROUTES } from '@/lib/constants';
import styles from './page.module.css';

export default function OrderDetailPage() {
  const routeParams = useParams();
  const id = (routeParams?.id as string) || '';
  const { data, isLoading, error } = useOrderDetail(id);
  const { data: claimsData } = useOrderClaims(id);
  const cancelOrderMutation = useCancelOrder();
  const addToast = useUIStore((s) => s.addToast);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  if (isLoading) {
    return <Loader fullScreen text="Loading live garment status..." />;
  }

  if (error || !data?.order) {
    return (
      <div className={styles.errorContainer}>
        <h2>Order Not Found</h2>
        <p>Could not locate the requested order details.</p>
        <Link href={ROUTES.dashboard}>
          <Button variant="primary">Return to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const order = data.order;
  const currentStageIndex = ORDER_STATUSES.findIndex((s) => s.key === order.status);
  const orderClaims = claimsData?.claims || [];

  const isDelayed = (() => {
    if (order.status === 'delivered') return false;
    if (!order.delivery_date) return false;
    const [year, month, day] = order.delivery_date.split('-').map(Number);
    if (!year || !month || !day) return false;
    const endHour = order.delivery_window === 'morning' ? 12 : 20;
    const targetDeadline = new Date(year, month - 1, day, endHour, 0, 0);
    return new Date() > targetDeadline;
  })();

  const handleConfirmCancel = async () => {
    try {
      await cancelOrderMutation.mutateAsync(order.id);
      setIsCancelModalOpen(false);
      addToast({
        type: 'success',
        title: 'Pickup Cancelled',
        message: 'Your pickup has been successfully cancelled. Zero charges were applied.',
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Cancellation Failed',
        message: (err as Error).message || 'Could not cancel pickup. Please try again.',
      });
    }
  };

  return (
    <AuthGuard allowedRoles={['admin', 'customer']}>
      <div className={styles.page}>
        <div className={styles.container}>
        {/* Top Breadcrumb Nav */}
        <div className={styles.navRow}>
          <Link href={ROUTES.dashboard} className={styles.backLink}>
            ← Back to Dashboard
          </Link>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {order.status === 'booked' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCancelModalOpen(true)}
                style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
              >
                🚫 Cancel Pickup
              </Button>
            )}
            <Link href={ROUTES.claim(order.id)}>
              <Button variant="outline" size="sm">
                🛡️ Make It Right Claim
              </Button>
            </Link>
          </div>
        </div>

        {/* Order Hero Card */}
        <Card variant="bordered" padding="lg" className={styles.headerCard}>
          <div className={styles.headerTop}>
            <div>
              <span className={styles.orderIdLabel}>Order #{order.order_number || order.id.slice(0, 8)}</span>
              <h1 className={styles.orderTitle}>
                {order.order_type === 'wash_fold'
                  ? '🧺 Wash & Fold'
                  : order.order_type === 'dry_clean'
                  ? '👔 Dry Cleaning'
                  : '🧺 Wash & Fold + 👔 Dry Cleaning'}
              </h1>
            </div>
            <Badge
              variant={
                order.status === 'delivered'
                  ? 'delivered'
                  : order.status === 'in_cleaning'
                  ? 'cleaning'
                  : order.status === 'out_for_delivery'
                  ? 'out_for_delivery'
                  : order.status === 'weighed_itemized'
                  ? 'weighed'
                  : 'booked'
              }
              size="md"
              dot
            >
              {ORDER_STATUSES.find((s) => s.key === order.status)?.label || order.status}
            </Badge>
          </div>

          <div
            className={styles.countdownBox}
            style={
              isDelayed
                ? { border: '1px solid rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.05)' }
                : undefined
            }
          >
            <div className={styles.countdownLeft}>
              <span className={styles.clockIcon}>{order.status === 'delivered' ? '✅' : isDelayed ? '⚠️' : '⏱️'}</span>
              <div>
                <strong>
                  {order.status === 'delivered'
                    ? 'Delivered on Schedule'
                    : isDelayed
                    ? '48-Hour Guarantee: Plant Rescheduling In Progress'
                    : '48-Hour Match-Ready Guarantee'}
                </strong>
                <p>
                  {order.status === 'delivered'
                    ? 'Delivered on '
                    : isDelayed
                    ? 'Target delivery was '
                    : 'Target delivery by '}
                  <strong>
                    {order.delivery_date} ({order.delivery_window || 'evening'})
                  </strong>
                  {order.status === 'delivered'
                    ? ' • 100% Make It Right Protected'
                    : isDelayed
                    ? ' • Concierge operations is actively prioritizing dispatch'
                    : ''}
                </p>
              </div>
            </div>
            <Badge variant={order.status === 'delivered' ? 'delivered' : isDelayed ? 'warning' : 'success'}>
              {order.status === 'delivered' ? 'Completed' : isDelayed ? 'Delayed' : 'On Schedule'}
            </Badge>
          </div>
        </Card>

        {/* 6-Stage Timeline */}
        <Card variant="bordered" padding="lg" className={styles.trackerWrapper}>
          <div className={styles.trackerStages}>
            {ORDER_STATUSES.map((stage, idx) => {
              const isPassed = idx <= currentStageIndex;
              const isCurrent = idx === currentStageIndex;
              return (
                <div
                  key={stage.key}
                  className={`${styles.stageCol} ${isPassed ? styles.passedStage : ''} ${isCurrent ? styles.currentStage : ''}`}
                >
                  <div className={styles.stageIconCircle}>
                    {isPassed ? stage.icon : '○'}
                  </div>
                  <span className={styles.stageLabel}>{stage.label}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Garment Passport Photo Inspection (Carvana Standard) */}
        <GarmentPassportTimeline order={order} />

        {/* Active Make It Right Claims */}
        {orderClaims.length > 0 && (
          <Card variant="bordered" padding="lg" className={styles.claimBannerCard}>
            <div className={styles.claimBannerHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--text-xl)' }}>🛡️</span>
                <span className={styles.claimBannerTitle}>
                  Make It Right Claim Logged ({orderClaims[0].issue_type.replace('_', ' ').toUpperCase()})
                </span>
              </div>
              <Badge
                variant={
                  orderClaims[0].status === 'resolved' || orderClaims[0].status === 'refunded'
                    ? 'delivered'
                    : orderClaims[0].status === 'investigating'
                    ? 'cleaning'
                    : 'warning'
                }
                dot
              >
                {orderClaims[0].status === 'open'
                  ? 'In Executive Review'
                  : orderClaims[0].status === 'investigating'
                  ? 'Plant Inspection Active'
                  : orderClaims[0].status === 'refunded'
                  ? 'Refund Issued'
                  : 'Resolved'}
              </Badge>
            </div>

            <div className={styles.claimBannerBody}>
              <p className={styles.claimReportText}>
                <strong>Your Issue Report:</strong> &ldquo;{orderClaims[0].description}&rdquo;
              </p>

              {orderClaims[0].resolution_notes ? (
                <div className={styles.adminResolutionReply}>
                  <p className={styles.adminReplyTitle}>
                    💬 First Eleven Executive Resolution Response:
                  </p>
                  <p className={styles.adminReplyText}>{orderClaims[0].resolution_notes}</p>
                  {orderClaims[0].refund_amount && orderClaims[0].refund_amount > 0 ? (
                    <span className={styles.claimRefundPill}>
                      💰 Refund Issued: ${orderClaims[0].refund_amount.toFixed(2)}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-navy)', margin: 0 }}>
                  ⏱️ Our plant director is reviewing the garment passport photos. An executive response will be posted here and sent via SMS within 2 business hours.
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Two Column Section: Itemized Ticket & Events Timeline */}
        <div className={styles.detailsGrid}>
          {/* Itemized Receipt */}
          <Card variant="bordered" padding="md" className={styles.detailCard}>
            <h3 className={styles.cardHeaderSmall}>🧾 Itemized Garment Receipt</h3>
            <div className={styles.itemsList}>
              {order.items?.map((item) => (
                <div key={item.id} className={styles.itemRow}>
                  <div>
                    <p className={styles.itemLabel}>{item.notes || item.garment_type}</p>
                    <span className={styles.itemSubtext}>Qty: {item.quantity}</span>
                  </div>
                  <span className={styles.itemTotal}>${item.subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className={styles.totalsTable}>
              <div className={styles.totalRow}>
                <span>Subtotal</span>
                <span>${order.subtotal.toFixed(2)}</span>
              </div>
              {order.discount_amount > 0 && (
                <div className={styles.discountRow}>
                  <span>Promo Discount ({order.promo_code})</span>
                  <span>-${order.discount_amount.toFixed(2)}</span>
                </div>
              )}
              <div className={styles.finalRow}>
                <span>Final Total Charged</span>
                <span>${order.total.toFixed(2)}</span>
              </div>
            </div>
          </Card>

          {/* Activity Events Timeline */}
          <Card variant="bordered" padding="md" className={styles.detailCard}>
            <h3 className={styles.cardHeaderSmall}>📋 Status Event Timeline</h3>
            <div className={styles.timelineList}>
              {order.events?.map((ev) => (
                <div key={ev.id} className={styles.timelineItem}>
                  <div className={styles.timelineMarker} />
                  <div className={styles.timelineContent}>
                    <p className={styles.eventNote}>{ev.note}</p>
                    <span className={styles.eventTime}>
                      {new Date(ev.timestamp).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      • {ev.triggered_by}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Cancellation Confirmation Modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancel Upcoming Pickup?"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ color: 'var(--color-gray-700)', fontSize: 'var(--text-sm)', lineHeight: '1.6', margin: 0 }}>
            Are you sure you want to cancel pickup for <strong>Order #{order.order_number || order.id.slice(0, 8)}</strong> scheduled for <strong>{order.pickup_date} ({order.pickup_window})</strong>?
          </p>
          <div style={{ background: 'var(--color-cream)', padding: '12px 16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-gray-200)' }}>
            <p style={{ color: 'var(--color-navy)', fontSize: 'var(--text-xs)', margin: 0, fontWeight: 'bold' }}>
              💡 Zero Risk Checkout Promise:
            </p>
            <p style={{ color: 'var(--color-gray-600)', fontSize: 'var(--text-xs)', margin: '4px 0 0' }}>
              Because your payment card is only charged after digital intake &amp; scale weighing at our plant, zero fees have been charged to your card.
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <Button variant="outline" size="sm" onClick={() => setIsCancelModalOpen(false)}>
              Keep Pickup
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={cancelOrderMutation.isPending}
              onClick={handleConfirmCancel}
            >
              Yes, Cancel Pickup
            </Button>
          </div>
        </div>
      </Modal>
    </div>
    </AuthGuard>
  );
}
