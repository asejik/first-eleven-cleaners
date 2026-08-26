'use client';

import { use, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useOrderDetail } from '@/hooks/useOrders';
import { useOrderClaims, useSubmitClaim } from '@/hooks/useClaims';
import { Button, Input, Card, Badge, Loader } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import { ROUTES } from '@/lib/constants';
import styles from './page.module.css';

export default function ClaimPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = use(params);
  const { data: orderData, isLoading: isOrderLoading } = useOrderDetail(orderId);
  const { data: claimsData, isLoading: isClaimsLoading } = useOrderClaims(orderId);
  const submitClaim = useSubmitClaim();
  const addToast = useUIStore((s) => s.addToast);

  const [issueType, setIssueType] = useState('quality_issue');
  const [description, setDescription] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [submittedClaim, setSubmittedClaim] = useState<{ claim_id: string; message: string } | null>(null);

  if (isOrderLoading || isClaimsLoading) {
    return <Loader fullScreen text="Loading Make It Right claim history..." />;
  }

  const existingClaims = claimsData?.claims || [];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    try {
      const res = await submitClaim.mutateAsync({
        order_id: orderId,
        issue_type: issueType,
        description,
      });

      setSubmittedClaim({
        claim_id: res.claim_id,
        message: res.message,
      });

      setDescription('');
      setShowNewForm(false);

      addToast({
        type: 'success',
        title: 'Claim Opened Under Refund-First Policy',
        message: 'Your request has been logged with highest executive priority.',
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Error Submitting Claim',
        message: (err as Error).message,
      });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.navRow}>
          <Link href={ROUTES.orderDetail(orderId)} className={styles.backLink}>
            ← Back to Order #{orderData?.order?.order_number || orderId}
          </Link>
        </div>

        <Card variant="bordered" padding="lg" className={styles.card}>
          <div className={styles.header}>
            <div className={styles.badgeRow}>
              <Badge variant="warning">Chewy-Standard Care</Badge>
              <Badge variant="info">Refund-First Policy</Badge>
            </div>
            <h1 className={styles.title}>Make It Right Guarantee</h1>
            <p className={styles.subtitle}>
              If any garment was not cleaned to perfection or had any issue, we resolve it immediately with no arguments.
            </p>
          </div>

          {/* Success Banner after new submission */}
          {submittedClaim && (
            <div className={styles.successState}>
              <span className={styles.successEmoji}>🛡️</span>
              <h2 className={styles.successTitle}>Claim #{submittedClaim.claim_id.slice(0, 8)} Logged</h2>
              <p className={styles.successText}>{submittedClaim.message}</p>
              <div className={styles.orderContextBox}>
                <p>
                  <strong>Linked Order:</strong> #{orderData?.order?.order_number || orderId}
                </p>
                <p>
                  <strong>Executive Resolution SLA:</strong> Under 2 business hours
                </p>
              </div>
            </div>
          )}

          {/* Existing Claims & Admin Resolution Timeline */}
          {existingClaims.length > 0 && (
            <div className={styles.existingClaimsSection}>
              <h3 className={styles.existingClaimsTitle}>
                🛡️ Make It Right History ({existingClaims.length})
              </h3>
              {existingClaims.map((claim) => (
                <div key={claim.id} className={styles.claimCard}>
                  <div className={styles.claimHead}>
                    <div>
                      <span className={styles.claimId}>
                        Claim #{claim.id.slice(0, 8).toUpperCase()} • {claim.issue_type.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className={styles.claimDate}>
                        Submitted {new Date(claim.created_at).toLocaleDateString()} at {new Date(claim.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <Badge
                      variant={
                        claim.status === 'resolved' || claim.status === 'refunded'
                          ? 'delivered'
                          : claim.status === 'investigating'
                          ? 'cleaning'
                          : 'warning'
                      }
                      dot
                    >
                      {claim.status === 'open'
                        ? 'Under Executive Review'
                        : claim.status === 'investigating'
                        ? 'Plant Inspection Active'
                        : claim.status === 'refunded'
                        ? 'Refund Issued'
                        : 'Resolved'}
                    </Badge>
                  </div>

                  <div className={styles.claimBody}>
                    <p className={styles.claimDesc}>
                      <strong>Your Issue Report:</strong> &ldquo;{claim.description}&rdquo;
                    </p>

                    {/* Admin Reply & Executive Resolution */}
                    {claim.resolution_notes ? (
                      <div className={styles.adminResolutionBox}>
                        <div className={styles.adminResolutionHeader}>
                          <span>💬</span>
                          <span>First Eleven Executive Resolution Response</span>
                        </div>
                        <p className={styles.adminResolutionText}>{claim.resolution_notes}</p>
                        {claim.refund_amount && claim.refund_amount > 0 ? (
                          <span className={styles.refundBadge}>
                            💰 Refund Issued: ${claim.refund_amount.toFixed(2)}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className={styles.pendingResolutionBox}>
                        ⏱️ <strong>In Executive Review:</strong> Our plant director is inspecting the garment intake photos and order records. Your resolution response and credit/re-clean confirmation will appear here shortly.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Form Toggle if previous claims exist */}
          {existingClaims.length > 0 && !showNewForm && !submittedClaim && (
            <Button
              variant="outline"
              onClick={() => setShowNewForm(true)}
              className={styles.toggleFormBtn}
            >
              + Open Another Claim for this Order
            </Button>
          )}

          {/* New Claim Form */}
          {(existingClaims.length === 0 || showNewForm) && !submittedClaim && (
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.orderBanner}>
                <div>
                  <span className={styles.bannerLabel}>Regarding Order:</span>
                  <strong>#{orderData?.order?.order_number || orderId}</strong>
                </div>
                {orderData?.order && (
                  <span className={styles.bannerMeta}>
                    {orderData.order.pickup_date} • ${orderData.order.total.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Issue Type */}
              <div className={styles.selectGroup}>
                <label htmlFor="issueTypeSelect">What went wrong?</label>
                <select
                  id="issueTypeSelect"
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value)}
                  className={styles.selectInput}
                >
                  <option value="quality_issue">Cleaning or Pressing Quality (Needs re-cleaning)</option>
                  <option value="garment_damage">Suspected Stain or Fabric Mark</option>
                  <option value="missing_item">Item Count Mismatch / Missing Piece</option>
                  <option value="delivery_issue">Turnaround or Delivery Timing Issue</option>
                  <option value="other">Other Concern</option>
                </select>
              </div>

              {/* Description */}
              <div className={styles.textareaGroup}>
                <label htmlFor="claimDescription">Describe the issue in detail</label>
                <textarea
                  id="claimDescription"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  placeholder="Tell us which garment and what you noticed so we can remediate immediately..."
                  className={styles.textarea}
                />
              </div>

              {/* Garment Passport Context Notice */}
              <div className={styles.passportNotice}>
                <span>📸</span>
                <p>
                  Our intake photos and calibrated weight records for Order #{orderData?.order?.order_number || orderId} are automatically attached to this claim for instant inspection.
                </p>
              </div>

              <Button
                type="submit"
                variant="danger"
                size="lg"
                fullWidth
                isLoading={submitClaim.isPending}
                disabled={!description.trim()}
              >
                Submit Claim & Open Remediation
              </Button>
            </form>
          )}

          <div style={{ marginTop: 'var(--space-4)', textAlign: 'center' }}>
            <Link href={ROUTES.dashboard}>
              <Button variant="ghost" size="sm">
                Return to Dashboard
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
