'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuth } from '@/hooks/useAuth';
import { useCustomerAddresses } from '@/hooks/useAddresses';
import { useCustomerPreferences } from '@/hooks/usePreferences';
import { useCustomerClaims } from '@/hooks/useClaims';
import { useCustomerProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useUIStore } from '@/stores/ui-store';
import { Button, Card, Badge, Input, Modal } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import styles from './page.module.css';

interface ProfileEditorFormProps {
  initialFullName: string;
  initialPhone: string;
  email: string;
  userId: string;
  initialChannel?: 'sms' | 'whatsapp' | 'email';
  initialPromoOptIn?: boolean;
}

function ProfileEditorForm({
  initialFullName,
  initialPhone,
  email,
  userId,
  initialChannel = 'sms',
  initialPromoOptIn = true,
}: ProfileEditorFormProps) {
  const updateProfileMutation = useUpdateProfile();
  const addToast = useUIStore((s) => s.addToast);

  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);
  const [preferredChannel, setPreferredChannel] = useState<'sms' | 'whatsapp' | 'email'>(initialChannel);
  const [promoOptIn, setPromoOptIn] = useState(initialPromoOptIn);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfileMutation.mutateAsync({
        full_name: fullName,
        phone,
        preferred_channel: preferredChannel,
        promo_opt_in: promoOptIn,
      });
      addToast({
        type: 'success',
        title: 'Profile Updated',
        message: 'Your personal details and communication preferences have been saved.',
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: (err as Error).message || 'Could not update profile.',
      });
    }
  };

  return (
    <form onSubmit={handleSave} className={styles.cardBody}>
        <Input
          id="profile-fullname"
          label="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="e.g. Alex Morgan"
          required
        />
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Email Address (Primary Auth)</span>
          <span className={styles.infoValue} style={{ color: 'var(--color-gray-600)', background: 'var(--color-gray-100)', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
            {email}
          </span>
        </div>
        <Input
          id="profile-phone"
          label="Mobile Phone (for ETA &amp; Photos)"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(214) 555-0199"
          required
          helperText="We send live driver arrival notifications & photo receipts here."
        />

        {/* Preferred Alert Channel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--color-navy)' }}>
            Notification Channel
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setPreferredChannel('sms')}
              aria-pressed={preferredChannel === 'sms'}
              style={{
                padding: '8px',
                borderRadius: 'var(--radius-md)',
                border: preferredChannel === 'sms' ? '2px solid var(--color-gold)' : '1px solid var(--color-gray-300)',
                background: preferredChannel === 'sms' ? 'var(--color-cream)' : 'var(--color-white)',
                fontSize: 'var(--text-xs)',
                fontWeight: preferredChannel === 'sms' ? 'bold' : 'normal',
                cursor: 'pointer',
              }}
            >
              💬 SMS
            </button>
            <button
              type="button"
              onClick={() => setPreferredChannel('whatsapp')}
              aria-pressed={preferredChannel === 'whatsapp'}
              style={{
                padding: '8px',
                borderRadius: 'var(--radius-md)',
                border: preferredChannel === 'whatsapp' ? '2px solid var(--color-gold)' : '1px solid var(--color-gray-300)',
                background: preferredChannel === 'whatsapp' ? 'var(--color-cream)' : 'var(--color-white)',
                fontSize: 'var(--text-xs)',
                fontWeight: preferredChannel === 'whatsapp' ? 'bold' : 'normal',
                cursor: 'pointer',
              }}
            >
              🟢 WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setPreferredChannel('email')}
              aria-pressed={preferredChannel === 'email'}
              style={{
                padding: '8px',
                borderRadius: 'var(--radius-md)',
                border: preferredChannel === 'email' ? '2px solid var(--color-gold)' : '1px solid var(--color-gray-300)',
                background: preferredChannel === 'email' ? 'var(--color-cream)' : 'var(--color-white)',
                fontSize: 'var(--text-xs)',
                fontWeight: preferredChannel === 'email' ? 'bold' : 'normal',
                cursor: 'pointer',
              }}
            >
              ✉️ Email
            </button>
          </div>
        </div>

        {/* TCPA Opt-In Checkbox */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: 'var(--text-xs)', color: 'var(--color-gray-600)', cursor: 'pointer', marginTop: '4px' }}>
          <input
            type="checkbox"
            checked={promoOptIn}
            onChange={(e) => setPromoOptIn(e.target.checked)}
            style={{ accentColor: 'var(--color-gold)', marginTop: '2px' }}
          />
          <span>
            Send me order progress updates, driver ETAs, and occasional match-ready seasonal specials.
          </span>
        </label>

        <div className={styles.infoRow} style={{ marginTop: '4px' }}>
          <span className={styles.infoLabel}>Account ID</span>
          <span className={styles.infoValue} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-500)', fontFamily: 'monospace' }}>
            {userId}
          </span>
        </div>

        <Button
          variant="primary"
          size="md"
          type="submit"
          isLoading={updateProfileMutation.isPending}
          style={{ marginTop: 'auto' }}
        >
          Save Profile Changes
        </Button>
      </form>
    );
}

function ProfilePersonalDetailsEditor({
  initialFullName,
  initialPhone,
  email,
  userId,
}: {
  initialFullName: string;
  initialPhone: string;
  email: string;
  userId: string;
}) {
  const { data: profileData } = useCustomerProfile();
  const profile = profileData?.profile;

  const currentFullName = profile?.full_name || initialFullName;
  const currentPhone = profile?.phone || initialPhone;
  const currentChannel = profile?.preferred_channel || 'sms';
  const currentPromoOptIn = profile?.promo_opt_in ?? true;

  return (
    <Card variant="bordered" padding="lg" className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>👤 Personal Details &amp; Alerts</h2>
      </div>
      <ProfileEditorForm
        key={`${userId}-${currentFullName}-${currentPhone}-${currentChannel}`}
        initialFullName={currentFullName}
        initialPhone={currentPhone}
        email={email}
        userId={userId}
        initialChannel={currentChannel}
        initialPromoOptIn={currentPromoOptIn}
      />
    </Card>
  );
}

function SecurityAndPrivacySection() {
  const { updatePassword, logout } = useAuth();
  const addToast = useUIStore((s) => s.addToast);
  const router = useRouter();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingData, setIsDeletingData] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      addToast({
        type: 'warning',
        title: 'Password Too Short',
        message: 'Password must be at least 8 characters long.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast({
        type: 'error',
        title: 'Passwords Do Not Match',
        message: 'Please ensure both password fields match.',
      });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await updatePassword(newPassword);
      if (res.error) {
        addToast({ type: 'error', title: 'Update Failed', message: res.error });
      } else {
        addToast({
          type: 'success',
          title: 'Password Updated',
          message: 'Your account password has been updated securely.',
        });
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: (err as Error).message || 'Could not update password.',
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleExportData = async () => {
    setIsExportingData(true);
    try {
      const res = await fetch('/api/customer/data-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_type: 'export',
          notes: 'Customer self-service export request from profile settings',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit export request');
      addToast({
        type: 'success',
        title: 'Data Export Initiated',
        message: 'Your TDPSA data report request has been logged. An archive will be delivered to your registered email.',
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Export Request Failed',
        message: (err as Error).message,
      });
    } finally {
      setIsExportingData(false);
    }
  };

  const handleConfirmDeletion = async () => {
    setIsDeletingData(true);
    try {
      const res = await fetch('/api/customer/data-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_type: 'deletion',
          notes: 'Customer self-service permanent account & data erasure request',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit deletion request');

      addToast({
        type: 'success',
        title: 'Deletion Request Submitted',
        message: 'Your request under TDPSA has been received and logged for processing. Logging you out.',
      });
      setIsDeleteModalOpen(false);
      setTimeout(() => {
        logout();
        router.push('/');
      }, 1500);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Deletion Request Failed',
        message: (err as Error).message,
      });
    } finally {
      setIsDeletingData(false);
    }
  };

  return (
    <>
      <Card variant="bordered" padding="lg" className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>🔒 Security &amp; Data Privacy</h2>
          <Badge variant="info">TDPSA Protected</Badge>
        </div>
        <div className={styles.cardBody}>
          <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', color: 'var(--color-navy)' }}>
              Update Password
            </span>
            <Input
              id="profile-new-password"
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
            <Input
              id="profile-confirm-password"
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              isLoading={isUpdatingPassword}
              disabled={!newPassword || !confirmPassword}
            >
              Update Password
            </Button>
          </form>

          <hr style={{ borderColor: 'var(--color-gray-200)', margin: 'var(--space-4) 0' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', color: 'var(--color-navy)' }}>
              TDPSA Privacy Rights
            </span>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-600)', lineHeight: '1.4' }}>
              Under the Texas Data Privacy and Security Act, you can request an export of your personal data or request permanent deletion of your profile.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleExportData}
                isLoading={isExportingData}
              >
                📥 Export My Data
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                style={{ color: '#dc2626' }}
                onClick={() => setIsDeleteModalOpen(true)}
              >
                🗑️ Request Data Deletion
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* TDPSA Deletion Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Request Personal Data Deletion (TDPSA)"
        size="md"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)} disabled={isDeletingData}>
              Cancel
            </Button>
            <Button
              variant="primary"
              style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
              onClick={handleConfirmDeletion}
              isLoading={isDeletingData}
            >
              Confirm Deletion Request
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ color: 'var(--color-gray-700)', fontSize: 'var(--text-sm)', margin: 0 }}>
            You are exercising your right to deletion under the <strong>Texas Data Privacy and Security Act (TDPSA)</strong>.
          </p>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', color: '#991b1b' }}>
            ⚠️ Submitting this request will initiate the permanent anonymization of your profile, addresses, garment passports, and communication records once pending orders are completed.
          </div>
          <p style={{ color: 'var(--color-gray-500)', fontSize: 'var(--text-xs)', margin: 0 }}>
            Our compliance officer logs all requests to an immutable audit trail.
          </p>
        </div>
      </Modal>
    </>
  );
}

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

  const handleLogout = () => {
    logout();
    router.push(ROUTES.login);
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
            {/* Account Details Card with Interactive Editing */}
            <ProfilePersonalDetailsEditor
              initialFullName={user?.full_name || ''}
              initialPhone={user?.phone || ''}
              email={user?.email || ''}
              userId={user?.id || ''}
            />

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

            {/* Security, Password Update, & TDPSA Data Rights */}
            <SecurityAndPrivacySection />
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
