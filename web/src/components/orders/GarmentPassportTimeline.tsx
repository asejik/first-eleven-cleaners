'use client';

import { useState } from 'react';
import { Badge, Modal, Button } from '@/components/ui';
import type { Order, GarmentPhoto } from '@/types';
import styles from './GarmentPassportTimeline.module.css';

interface GarmentPassportTimelineProps {
  order: Order;
}

export function GarmentPassportTimeline({ order }: GarmentPassportTimelineProps) {
  const [viewMode, setViewMode] = useState<'comparison' | 'gallery'>('comparison');
  const [zoomPhoto, setZoomPhoto] = useState<{ url: string; title: string; notes?: string | null } | null>(null);

  const photos = order.photos || [];
  const intakePhotos = photos.filter((p) => p.photo_type === 'intake' || p.photo_type === 'pickup_proof');
  const returnPhotos = photos.filter((p) => p.photo_type === 'delivery_proof' || p.photo_type === 'return');

  const primaryIntake = intakePhotos[0] || photos[0];
  const primaryReturn = returnPhotos[0] || (photos.length > 1 ? photos[photos.length - 1] : null);

  return (
    <div className={styles.passportContainer}>
      {/* Header */}
      <div className={styles.headerRow}>
        <div>
          <span className={styles.badgeTag}>Carvana-Standard Transparency</span>
          <h2 className={styles.title}>📸 Garment Passport™ Visual Inspection</h2>
          <p className={styles.subtitle}>
            &ldquo;You see what we see.&rdquo; High-resolution timestamped visual records from intake weighing to pristine return delivery.
          </p>
        </div>

        <div className={styles.viewSwitcher}>
          <button
            type="button"
            className={`${styles.switchBtn} ${viewMode === 'comparison' ? styles.switchBtnActive : ''}`}
            onClick={() => setViewMode('comparison')}
          >
            ✨ Side-by-Side Split View
          </button>
          <button
            type="button"
            className={`${styles.switchBtn} ${viewMode === 'gallery' ? styles.switchBtnActive : ''}`}
            onClick={() => setViewMode('gallery')}
          >
            🖼️ All Records ({photos.length})
          </button>
        </div>
      </div>

      {/* Metric Pills Bar */}
      <div className={styles.metricsBar}>
        <div className={styles.metricCard}>
          <span className={styles.metricIcon}>🛡️</span>
          <div>
            <span className={styles.metricLabel}>Inspection Integrity</span>
            <p className={styles.metricValue}>100% Match-Ready</p>
          </div>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricIcon}>🔄</span>
          <div>
            <span className={styles.metricLabel}>Garment Passport Cycle</span>
            <p className={styles.metricValue}>Cycle #1 at First Eleven</p>
          </div>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricIcon}>⚖️</span>
          <div>
            <span className={styles.metricLabel}>Digital Scale Verification</span>
            <p className={styles.metricValue}>{order.weight_lbs ? `${order.weight_lbs} lbs Verified` : 'Itemized Menu'}</p>
          </div>
        </div>
      </div>

      {/* Pre-Existing Flaw Protection Alert */}
      {order.notes && (
        <div className={styles.flawBanner}>
          <strong>📋 Pre-Treatment & Condition Log:</strong> {order.notes}
        </div>
      )}

      {/* Side-by-Side Comparison View */}
      {viewMode === 'comparison' ? (
        <div className={styles.splitGrid}>
          {/* Left: Intake Inspection Record */}
          <div className={styles.comparisonCard}>
            <div className={`${styles.cardBanner} ${styles.intakeBanner}`}>
              <span>🔍 1. Intake Digital Check</span>
              <Badge variant="warning">Initial Intake</Badge>
            </div>

            <div
              className={styles.imageFrame}
              onClick={() =>
                primaryIntake &&
                setZoomPhoto({
                  url: primaryIntake.photo_url,
                  title: 'Intake Digital Scale & Condition Record',
                  notes: primaryIntake.condition_notes,
                })
              }
              title="Click to view full uncropped photo"
            >
              <span className={styles.zoomBadge}>🔍 Click to Expand</span>
              {primaryIntake ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={primaryIntake.photo_url}
                  alt="Intake Garment Record"
                  className={styles.garmentImg}
                />
              ) : (
                <div style={{ color: '#94a3b8', fontSize: 'var(--text-xs)' }}>No intake photo recorded</div>
              )}
            </div>

            <div className={styles.captionBox}>
              <span className={styles.captionTitle}>Condition Recorded at Central Scale</span>
              <p className={styles.captionNote}>
                {primaryIntake?.condition_notes || 'Intake tags verified and pre-treated according to fabric care labels.'}
              </p>
              {primaryIntake?.captured_at && (
                <span className={styles.timestamp}>
                  Captured {new Date(primaryIntake.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} by {primaryIntake.captured_by || 'Elena (Intake)'}
                </span>
              )}
            </div>
          </div>

          {/* Right: Pristine Return / Delivery Record */}
          <div className={styles.comparisonCard}>
            <div className={`${styles.cardBanner} ${styles.returnBanner}`}>
              <span>✨ 2. Pressed & Delivered Return</span>
              <Badge variant="delivered">Match-Ready Return</Badge>
            </div>

            <div
              className={styles.imageFrame}
              onClick={() =>
                primaryReturn &&
                setZoomPhoto({
                  url: primaryReturn.photo_url,
                  title: 'Delivered Match-Ready Return',
                  notes: primaryReturn.condition_notes,
                })
              }
              title="Click to view full uncropped photo"
            >
              <span className={styles.zoomBadge}>🔍 Click to Expand</span>
              {primaryReturn ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={primaryReturn.photo_url}
                  alt="Return Garment Proof"
                  className={styles.garmentImg}
                />
              ) : (
                <div style={{ color: '#94a3b8', fontSize: 'var(--text-xs)', textAlign: 'center', padding: '20px' }}>
                  <span>⏳ In Professional Process</span>
                  <p style={{ margin: '4px 0 0', fontSize: '10px' }}>Final return photo will be logged upon porch drop-off.</p>
                </div>
              )}
            </div>

            <div className={styles.captionBox}>
              <span className={styles.captionTitle}>Quality Assurance & Doorstep Proof</span>
              <p className={styles.captionNote}>
                {primaryReturn?.condition_notes || (order.status === 'delivered' ? 'Delivered safely to customer doorstep.' : 'Garment is currently finishing master pressing in plant line.')}
              </p>
              {primaryReturn?.captured_at && (
                <span className={styles.timestamp}>
                  Logged {new Date(primaryReturn.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} by {primaryReturn.captured_by || 'Marcus (Route Driver)'}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Gallery View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
          {photos.map((photo: GarmentPhoto) => (
            <div key={photo.id} className={styles.comparisonCard}>
              <div
                className={styles.imageFrame}
                onClick={() =>
                  setZoomPhoto({
                    url: photo.photo_url,
                    title: photo.photo_type === 'intake' ? 'Intake Inspection Record' : 'Delivery Verification Record',
                    notes: photo.condition_notes,
                  })
                }
              >
                <span className={styles.zoomBadge}>🔍 Expand</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.photo_url} alt="Passport Record" className={styles.garmentImg} />
              </div>
              <div className={styles.captionBox}>
                <span className={styles.captionTitle}>
                  {photo.photo_type === 'intake' ? 'Intake Check' : 'Delivery Proof'}
                </span>
                <p className={styles.captionNote}>{photo.condition_notes || 'Verified'}</p>
                <span className={styles.timestamp}>
                  {new Date(photo.captured_at).toLocaleDateString()} {new Date(photo.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fullscreen Lightbox Zoom Modal */}
      <Modal
        isOpen={Boolean(zoomPhoto)}
        onClose={() => setZoomPhoto(null)}
        title={`📸 ${zoomPhoto?.title || 'Garment Passport Photo Record'}`}
        size="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          {zoomPhoto && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={zoomPhoto.url}
              alt="High-resolution preview"
              style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 'var(--radius-lg)' }}
            />
          )}
          {zoomPhoto?.notes && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-navy)', margin: 0, fontWeight: 'bold' }}>
              Condition Note: {zoomPhoto.notes}
            </p>
          )}
          <Button variant="primary" size="sm" onClick={() => setZoomPhoto(null)}>
            Close Photo Record
          </Button>
        </div>
      </Modal>
    </div>
  );
}
