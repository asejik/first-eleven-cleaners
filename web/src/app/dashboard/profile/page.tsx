'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuth } from '@/hooks/useAuth';
import { useCustomerAddresses } from '@/hooks/useAddresses';
import { useCustomerPreferences } from '@/hooks/usePreferences';
import { useCustomerClaims } from '@/hooks/useClaims';
import { Button, Card, Badge } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import styles from './page.module.css';

export default function ProfilePage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { data: addressData } = useCustomerAddresses();
  const { data: prefData } = useCustomerPreferences();
  const { data: claimsData } = useCustomerClaims();

  const addresses = addressData?.addresses || [];
  const defaultAddr = addresses.find((a) => a.is_default) || addresses[0];
  const prefs = prefData?.preferences;
  const claims = claimsData?.claims || [];

  const handleLogout = async () => {
    await logout();
    router.push(ROUTES.home);
  };

  const initial = user?.full_name?.charAt(0).toUpperCase() || 'U';

  return (
    <AuthGuard allowedRoles={['admin', 'customer']}>
      <div className={styles.page}>
        <div className={styles.container}>
          {/* Top Nav */}
          <div className={styles.topNav}>
            <Link href={ROUTES.dashboard} className={styles.backLink}>
              ← Back to Dashboard
            </Link>
            <Link href={ROUTES.book}>
              <Button variant="primary" size="sm">
                + Schedule Pickup
              </Button>
            </Link>
          </div>

          {/* Profile Header Banner */}
          <div className={styles.profileBanner}>
            <div className={styles.bannerUser}>
              <div className={styles.avatarCircle}>{initial}</div>
              <div>
                <h1 className={styles.userName}>{user?.full_name || 'Valued Member'}</h1>
                <p className={styles.userEmail}>{user?.email}</p>
                <div className={styles.userBadges}>
                  <Badge variant="success">Active Member</Badge>
                  <Badge variant="info">48-Hr Guaranteed</Badge>
                </div>
              </div>
            </div>
            <Button variant="outlineLight" size="sm" onClick={handleLogout}>
              Log Out
            </Button>
          </div>

          {/* Settings Grid */}
          <div className={styles.grid}>
            {/* Account Details Card */}
            <Card variant="bordered" padding="lg" className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>👤 Personal Details</h2>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Full Name</span>
                  <span className={styles.infoValue}>{user?.full_name || 'Not specified'}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Email Address</span>
                  <span className={styles.infoValue}>{user?.email}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Phone Number</span>
                  <span className={styles.infoValue}>{user?.phone || 'Not linked'}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Account ID</span>
                  <span className={styles.infoValue} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-500)', fontFamily: 'monospace' }}>
                    {user?.id}
                  </span>
                </div>
              </div>
            </Card>

            {/* Saved Addresses Card */}
            <Card variant="bordered" padding="lg" className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>📍 Saved Addresses ({addresses.length})</h2>
                <Link href={ROUTES.addresses}>
                  <Button variant="outline" size="sm">
                    Manage Addresses →
                  </Button>
                </Link>
              </div>
              <div className={styles.cardBody}>
                {defaultAddr ? (
                  <div className={styles.addressSummaryItem}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <span className={styles.addressSummaryText}>
                          {defaultAddr.street} {defaultAddr.unit && `(${defaultAddr.unit})`}
                        </span>
                        {defaultAddr.is_default && <Badge variant="success">Primary</Badge>}
                      </div>
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                        {defaultAddr.city}, {defaultAddr.state} {defaultAddr.zip}
                      </p>
                      {defaultAddr.delivery_notes && (
                        <p className={styles.addressNotesPreview}>
                          📝 {defaultAddr.delivery_notes}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-500)' }}>
                    No pickup addresses saved yet.
                  </p>
                )}

                <Link href={ROUTES.addresses} style={{ marginTop: 'auto' }}>
                  <Button variant="outline" size="sm" fullWidth>
                    + Add New Address (e.g. Office / Home)
                  </Button>
                </Link>
              </div>
            </Card>

            {/* Eleven AI Garment Memory Card */}
            <Card variant="bordered" padding="lg" className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>🤖 Eleven&apos;s Memory</h2>
                <Link href={ROUTES.preferences}>
                  <Button variant="outline" size="sm">
                    Edit Preferences →
                  </Button>
                </Link>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.prefPillGrid}>
                  <div className={styles.prefPill}>
                    <strong>Shirt Starch</strong>
                    <span>{(prefs?.starch_level || 'none').toUpperCase()}</span>
                  </div>
                  <div className={styles.prefPill}>
                    <strong>Finishing</strong>
                    <span>{prefs?.fold_vs_hang === 'fold' ? '🧺 Neatly Folded' : '👔 On Hangers'}</span>
                  </div>
                  <div className={styles.prefPill}>
                    <strong>Detergent</strong>
                    <span>{prefs?.detergent_sensitivity || 'Standard Hypoallergenic'}</span>
                  </div>
                  <div className={styles.prefPill}>
                    <strong>Gate / Access</strong>
                    <span>{prefs?.gate_code || 'None'}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Make It Right Guarantee Center Card */}
            <Card variant="bordered" padding="lg" className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>🛡️ Make It Right Protection</h2>
              </div>
              <div className={styles.cardBody}>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-600)', lineHeight: 'var(--leading-relaxed)' }}>
                  Every pickup is backed by our 100% Refund-First guarantee. If any garment has an issue, we resolve it within 2 business hours.
                </p>
                {claims.length > 0 ? (
                  <div style={{ background: 'var(--color-cream)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)' }}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', color: 'var(--color-navy)' }}>
                      Active Claims: {claims.length}
                    </span>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-600)', marginTop: '2px' }}>
                      Latest: Claim #{claims[0].id.slice(0, 8)} ({claims[0].status})
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-gold-dark)', fontSize: 'var(--text-sm)', fontWeight: 'bold' }}>
                    <span>✨</span>
                    <span>All orders in good standing</span>
                  </div>
                )}
                <Link href={ROUTES.dashboard} style={{ marginTop: 'auto' }}>
                  <Button variant="ghost" size="sm" fullWidth>
                    View Order History in Dashboard
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
