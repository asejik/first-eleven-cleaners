'use client';

import { useState } from 'react';
import { Modal, Button, Input } from '@/components/ui';
import { useUpdateStaff } from '@/hooks/useStaff';
import { useUIStore } from '@/stores/ui-store';
import type { StaffMember } from '@/types';
import styles from './StaffRoster.module.css';

interface EditStaffModalProps {
  staff: StaffMember | null;
  onClose: () => void;
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `F11-Reset-${rand}`;
}

export function EditStaffModal({ staff, onClose }: EditStaffModalProps) {
  if (!staff) return null;

  return (
    <Modal isOpen={Boolean(staff)} onClose={onClose} title={`Edit Staff: ${staff.full_name}`}>
      <EditStaffForm key={staff.id} staff={staff} onClose={onClose} />
    </Modal>
  );
}

function EditStaffForm({ staff, onClose }: { staff: StaffMember; onClose: () => void }) {
  const [fullName, setFullName] = useState(staff.full_name);
  const [phone, setPhone] = useState(staff.phone);
  const [role, setRole] = useState<'driver' | 'intake_staff'>(
    staff.role === 'intake_staff' ? 'intake_staff' : 'driver'
  );
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordReset, setShowPasswordReset] = useState(false);

  const updateStaff = useUpdateStaff();
  const addToast = useUIStore((s) => s.addToast);

  const isPrimaryAdmin = staff.role === 'admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const updates: {
        full_name: string;
        phone: string;
        role?: 'driver' | 'intake_staff';
        password?: string;
      } = {
        full_name: fullName.trim(),
        phone: phone.trim(),
      };

      if (!isPrimaryAdmin) {
        updates.role = role;
      }

      if (showPasswordReset && newPassword.trim()) {
        if (newPassword.trim().length < 8) {
          addToast({ type: 'error', title: 'Invalid Password', message: 'Password must be at least 8 characters.' });
          return;
        }
        updates.password = newPassword.trim();
      }

      const res = await updateStaff.mutateAsync({
        id: staff.id,
        updates,
      });

      addToast({
        type: 'success',
        title: 'Staff Updated',
        message: res.message,
      });

      onClose();
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: (err as Error).message,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className={styles.formGroup}>
        <Input
          label="Full Name *"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </div>

      <div className={styles.formGroup}>
        <Input
          label="Email Address"
          value={staff.email}
          disabled
        />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-500)' }}>
          Email address is fixed to the staff authentication login.
        </span>
      </div>

      <div className={styles.formGroup}>
        <Input
          label="Phone Number *"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
      </div>

      {!isPrimaryAdmin && (
        <div className={styles.formGroup}>
          <label className={styles.label}>Role Assignment</label>
          <select
            className={styles.select}
            value={role}
            onChange={(e) => setRole(e.target.value as 'driver' | 'intake_staff')}
          >
            <option value="driver">🚐 Delivery Driver (Fleet & Route Manifest)</option>
            <option value="intake_staff">⚖️ Plant Intake Specialist (Weigh-in & Tagging)</option>
          </select>
        </div>
      )}

      <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--color-gray-200)', paddingTop: 'var(--space-4)' }}>
        {!showPasswordReset ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setShowPasswordReset(true);
              setNewPassword(generatePassword());
            }}
          >
            🔑 Reset Staff Password
          </Button>
        ) : (
          <div className={styles.formGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label className={styles.label} style={{ margin: 0 }}>New Password</label>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--color-gray-500)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                onClick={() => setShowPasswordReset(false)}
              >
                Cancel Reset
              </button>
            </div>
            <div className={styles.passwordRow}>
              <div className={styles.passwordInput}>
                <Input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewPassword(generatePassword())}
              >
                🎲 Random
              </Button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
        <Button type="button" variant="ghost" fullWidth onClick={onClose} disabled={updateStaff.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" fullWidth isLoading={updateStaff.isPending}>
          Save Changes
        </Button>
      </div>
    </form>
  );
}
