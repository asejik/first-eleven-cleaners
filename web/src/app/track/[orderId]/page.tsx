'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useOrderDetail } from '@/hooks/useOrders';
import { Button, Card, Badge, Loader, Modal } from '@/components/ui';
import { ORDER_STATUSES, ROUTES } from '@/lib/constants';
import styles from './page.module.css';

export default function PublicTrackingPage() {
  const routeParams = useParams();
  const orderId = (routeParams?.orderId as string) || '';
  const { data, isLoading } = useOrderDetail(orderId);
  const [zoomPhoto, setZoomPhoto] = useState<{ url: string; title: string; notes?: string | null } | null>(null);

  if (isLoading) {
    return <Loader fullScreen text="Locating order live status..." />;
  }

  const order = data?.order;
  const currentStageIndex = order ? ORDER_STATUSES.findIndex((s) => s.key === order.status) : 0;

  const isDelayed = (() => {
    if (!order || order.status === 'delivered' || !order.delivery_date) return false;
    const [year, month, day] = order.delivery_date.split('-').map(Number);
    if (!year || !month || !day) return false;
    const endHour = order.delivery_window === 'morning' ? 12 : 20;
    const targetDeadline = new Date(year, month - 1, day, endHour, 0, 0);
    return new Date() > targetDeadline;
  })();

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <Link href={ROUTES.home} style={{ display: 'inline-block', marginBottom: 'var(--space-3)' }}>
            <Image
              src="/logo.png"
              alt="First Eleven Cleaners"
              width={220}
              height={55}
              priority
              style={{ height: '48px', width: 'auto', margin: '0 auto', objectFit: 'contain' }}
            />
          </Link>
          <h1 className={styles.title}>Live Garment Tracker</h1>
          <p className={styles.orderNumber}>Tracking Order #{order?.order_number || orderId}</p>
        </div>

        {order ? (
          <Card variant="bordered" padding="lg" className={styles.trackingCard}>
            {/* Status Header */}
            <div className={styles.statusRow}>
              <div>
                <span className={styles.statusLabel}>Current Status:</span>
                <h2 className={styles.statusName}>
                  {ORDER_STATUSES.find((s) => s.key === order.status)?.label || order.status}
                </h2>
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
                {ORDER_STATUSES.find((s) => s.key === order.status)?.label || 'On Schedule'}
              </Badge>
            </div>

            {/* Match-Ready Countdown */}
            <div
              className={styles.countdownBox}
              style={
                isDelayed
                  ? { border: '1px solid rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.05)' }
                  : undefined
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1 }}>
                <span className={styles.clockIcon}>{order.status === 'delivered' ? '✅' : isDelayed ? '⚠️' : '⏱️'}</span>
                <div>
                  <strong>
                    {order.status === 'delivered'
                      ? 'Delivered on Schedule'
                      : isDelayed
                      ? 'Delivery Delayed — Expediting Under Guarantee'
                      : 'Estimated Delivery'}
                  </strong>
                  <p>
                    {order.status === 'delivered'
                      ? 'Delivered on '
                      : isDelayed
                      ? 'Target delivery was '
                      : 'Target delivery by '}
                    <strong>
                      {order.delivery_date} ({order.delivery_window || 'Evening'})
                    </strong>
                    {order.status === 'delivered'
                      ? ' • 100% Match-Ready'
                      : isDelayed
                      ? ' • Plant operations team is prioritizing drop-off'
                      : ''}
                  </p>
                </div>
              </div>
              <Badge variant={order.status === 'delivered' ? 'delivered' : isDelayed ? 'warning' : 'success'}>
                {order.status === 'delivered' ? 'Completed' : isDelayed ? 'Delayed' : 'On Schedule'}
              </Badge>
            </div>

            {/* Visual 6-Stage Timeline */}
            <div className={styles.timelineWrapper}>
              <div className={styles.stagesGrid}>
                {ORDER_STATUSES.map((stage, idx) => {
                  const isPassed = idx <= currentStageIndex;
                  const isCurrent = idx === currentStageIndex;
                  return (
                    <div
                      key={stage.key}
                      className={`${styles.stageCol} ${isPassed ? styles.passed : ''} ${isCurrent ? styles.current : ''}`}
                    >
                      <div className={styles.stageCircle}>
                        {isPassed ? stage.icon : '○'}
                      </div>
                      <span className={styles.stageTitle}>{stage.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Garment Passport Photos (Intake Inspection & Delivery Proof) */}
            {order.photos && order.photos.length > 0 && (
              <div className={styles.photosSection}>
                <h3 className={styles.photosHeading}>📸 Garment Passport & Photo Proof</h3>
                <p className={styles.photosSub}>
                  &ldquo;You see what we see.&rdquo; High-resolution timestamped inspection & delivery drop photos. Click any photo to expand full view.
                </p>

                <div className={styles.photosGrid}>
                  {order.photos.map((photo) => (
                    <div key={photo.id} className={styles.photoCard}>
                      <div
                        className={styles.imageContainer}
                        onClick={() =>
                          setZoomPhoto({
                            url: photo.photo_url,
                            title: photo.photo_type === 'intake' ? 'Intake Inspection Check' : 'Delivery Drop Proof',
                            notes: photo.condition_notes,
                          })
                        }
                        title="Click to view full uncropped photo"
                      >
                        <span className={styles.expandBadge}>🔍 Click to Expand</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.photo_url}
                          alt="Garment inspection proof"
                          className={styles.garmentImg}
                        />
                      </div>
                      <div className={styles.photoCaption}>
                        <span className={styles.photoTypeBadge}>
                          {photo.photo_type === 'intake' ? 'Intake Check' : 'Delivery Proof'}
                        </span>
                        {photo.condition_notes && (
                          <p className={styles.conditionText}>{photo.condition_notes}</p>
                        )}
                        <span className={styles.photoTimestamp}>
                          Logged {new Date(photo.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} by {photo.captured_by || 'Staff'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className={styles.actionsBox}>
              <Link href={ROUTES.claim(orderId)}>
                <Button variant="outline" fullWidth>
                  🛡️ Have an issue? Make It Right Claim
                </Button>
              </Link>
              <Link href={ROUTES.home}>
                <Button variant="ghost" fullWidth>
                  First Eleven Cleaners Home
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <Card variant="surface" padding="lg" className={styles.notFoundCard}>
            <h3>Order Not Found</h3>
            <p>Could not locate active status for order #{orderId}.</p>
            <Link href={ROUTES.home}>
              <Button variant="primary">Return to Home</Button>
            </Link>
          </Card>
        )}

        {/* Lightbox Zoom Modal */}
        <Modal
          isOpen={Boolean(zoomPhoto)}
          onClose={() => setZoomPhoto(null)}
          title={`📸 ${zoomPhoto?.title || 'Photo Inspection'}`}
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            {zoomPhoto && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={zoomPhoto.url}
                alt="Full preview"
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 'var(--radius-lg)' }}
              />
            )}
            {zoomPhoto?.notes && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-navy)', margin: 0, fontWeight: 'bold' }}>
                Inspection Note: {zoomPhoto.notes}
              </p>
            )}
            <Button variant="primary" size="sm" onClick={() => setZoomPhoto(null)}>
              Close Photo
            </Button>
          </div>
        </Modal>
      </div>
    </div>
  );
}
