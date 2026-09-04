'use client';

import { useState } from 'react';
import { Modal, Button, Input } from '@/components/ui';
import { useCreateStaff } from '@/hooks/useStaff';
import { useUIStore } from '@/stores/ui-store';
import styles from './StaffRoster.module.css';

interface AddStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `F11-Pass-${rand}`;
}

export function AddStaffModal({ isOpen, onClose }: AddStaffModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'driver' | 'intake_staff'>('driver');
  const [password, setPassword] = useState(generatePassword());
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; pass: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createStaff = useCreateStaff();
  const addToast = useUIStore((s) => s.addToast);

  const handleGenerate = () => {
    setPassword(generatePassword());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    try {
      const res = await createStaff.mutateAsync({
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role,
        password,
      });

      addToast({
        type: 'success',
        title: 'Staff Member Provisioned',
        message: res.message,
      });

      setCreatedCredentials({
        email: email.trim(),
        pass: password,
      });
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to provision staff member.';
      setErrorMessage(msg);
      addToast({
        type: 'error',
        title: 'Provisioning Failed',
        message: msg,
      });
    }
  };

  const handleFinish = () => {
    setErrorMessage(null);
    setCreatedCredentials(null);
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword(generatePassword());
    onClose();
  };

  const handleCloseModal = () => {
    setErrorMessage(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={createdCredentials ? handleFinish : handleCloseModal}
      title={createdCredentials ? 'Staff Login Credentials' : 'Add New Driver / Staff Member'}
    >
      {createdCredentials ? (
        <div>
          <p style={{ fontSize: 'var(--text-sm)', color: '#334155', marginBottom: 'var(--space-3)', fontWeight: 500 }}>
            The account has been created. Provide these login details directly to the new team member:
          </p>

          <div className={styles.credentialCard}>
            <div className={styles.credentialTitle}>Driver / Staff Credentials</div>
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: '#475569', display: 'block', fontWeight: 600, marginBottom: '2px' }}>Login Email:</span>
              <strong className={styles.credentialValue}>{createdCredentials.email}</strong>
            </div>
            <div>
              <span style={{ fontSize: 'var(--text-xs)', color: '#475569', display: 'block', fontWeight: 600, marginBottom: '2px' }}>Temporary Password:</span>
              <strong className={styles.credentialValue}>{createdCredentials.pass}</strong>
            </div>
          </div>

          <div style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-3)' }}>
            <Button
              variant="outline"
              fullWidth
              onClick={() => {
                navigator.clipboard.writeText(
                  `First Eleven Cleaners Staff Login\nEmail: ${createdCredentials.email}\nPassword: ${createdCredentials.pass}\nLogin at: ${window.location.origin}/login`
                );
                addToast({ type: 'info', title: 'Copied', message: 'Credentials copied to clipboard.' });
              }}
            >
              📋 Copy Credentials
            </Button>
            <Button variant="primary" fullWidth onClick={handleFinish}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {errorMessage && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                color: '#991B1B',
                border: '1px solid #FECACA',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                marginBottom: 'var(--space-4)',
                fontSize: 'var(--text-xs)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              role="alert"
            >
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          <div className={styles.formGroup}>
            <Input
              label="Full Name *"
              placeholder="e.g. Alex Johnson"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <Input
              label="Staff Email *"
              type="email"
              placeholder="e.g. alex.driver@firstelevencleaners.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <Input
              label="Phone Number *"
              placeholder="e.g. +1 (214) 555-0144"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Operational Role *</label>
            <select
              className={styles.select}
              value={role}
              onChange={(e) => setRole(e.target.value as 'driver' | 'intake_staff')}
            >
              <option value="driver">🚐 Delivery Driver (Fleet & Route Manifest)</option>
              <option value="intake_staff">⚖️ Plant Intake Specialist (Weigh-in & Tagging)</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Initial Password *</label>
            <div className={styles.passwordRow}>
              <div className={styles.passwordInput}>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleGenerate}>
                🎲 Random
              </Button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
            <Button type="button" variant="ghost" fullWidth onClick={onClose} disabled={createStaff.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" fullWidth isLoading={createStaff.isPending}>
              Provision Staff Member
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
