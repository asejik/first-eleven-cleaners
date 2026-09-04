'use client';

import { useState } from 'react';
import { Button, Badge, Loader } from '@/components/ui';
import { useStaffList, useUpdateStaff } from '@/hooks/useStaff';
import { useUIStore } from '@/stores/ui-store';
import { AddStaffModal } from './AddStaffModal';
import { EditStaffModal } from './EditStaffModal';
import type { StaffMember } from '@/types';
import styles from './StaffRoster.module.css';

const ROLE_COLORS: Record<string, string> = {
  admin: '#8B5CF6',
  driver: '#3B82F6',
  intake_staff: '#10B981',
};

export function StaffRoster() {
  const { data, isLoading } = useStaffList();
  const updateStaff = useUpdateStaff();
  const addToast = useUIStore((s) => s.addToast);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | 'driver' | 'intake_staff' | 'admin'>('all');

  const staff = data?.staff || [];

  const activeDrivers = staff.filter((s) => s.role === 'driver' && s.is_active).length;
  const activeIntake = staff.filter((s) => s.role === 'intake_staff' && s.is_active).length;
  const totalActive = staff.filter((s) => s.is_active).length;

  const filteredStaff = roleFilter === 'all' ? staff : staff.filter((s) => s.role === roleFilter);

  const handleToggleActive = async (member: StaffMember) => {
    if (member.role === 'admin') {
      addToast({
        type: 'warning',
        title: 'Action Not Permitted',
        message: 'Administrator accounts cannot be deactivated.',
      });
      return;
    }

    const newActiveState = !member.is_active;

    try {
      await updateStaff.mutateAsync({
        id: member.id,
        updates: { is_active: newActiveState },
      });

      addToast({
        type: newActiveState ? 'success' : 'info',
        title: newActiveState ? 'Staff Activated' : 'Staff Deactivated',
        message: `${member.full_name} is now ${newActiveState ? 'active and permitted to log in' : 'deactivated and blocked from route access'}.`,
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: (err as Error).message,
      });
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <div className={styles.rosterCard}>
      {/* Top Header Row */}
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <div className={styles.titleIcon}>🚐</div>
          <div>
            <h2 className={styles.title}>Fleet & Operations Roster</h2>
            <p className={styles.subtitle}>
              Manage van delivery drivers, plant intake specialists, and access credentials
            </p>
          </div>
        </div>

        <Button variant="primary" size="md" onClick={() => setIsAddModalOpen(true)}>
          + Add New Driver / Staff
        </Button>
      </div>

      {/* KPI Stats & Role Filter Strip */}
      <div className={styles.statsRow}>
        <div className={`${styles.statPill} ${styles.statPillActive}`}>
          <span>🚐</span>
          <span><strong>{activeDrivers}</strong> Active Drivers</span>
        </div>
        <div className={styles.statPill}>
          <span>⚖️</span>
          <span><strong>{activeIntake}</strong> Intake Specialists</span>
        </div>
        <div className={styles.statPill}>
          <span>👥</span>
          <span><strong>{totalActive}</strong> Total Active Staff</span>
        </div>

        {/* Filter Pills */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {(['all', 'driver', 'intake_staff', 'admin'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setRoleFilter(filter)}
              style={{
                border: 'none',
                background: roleFilter === filter ? 'var(--color-navy)' : 'transparent',
                color: roleFilter === filter ? 'var(--color-white)' : 'var(--color-gray-600)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                fontSize: 'var(--text-xs)',
                fontWeight: roleFilter === filter ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {filter === 'all'
                ? 'All Team'
                : filter === 'driver'
                ? 'Drivers'
                : filter === 'intake_staff'
                ? 'Intake'
                : 'Admins'}
            </button>
          ))}
        </div>
      </div>

      {/* Table / List View */}
      {isLoading ? (
        <div style={{ padding: 'var(--space-8)' }}>
          <Loader text="Loading team roster..." />
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyEmoji}>📋</div>
          <p>No staff members found matching this filter.</p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Team Member</th>
                <th>Role</th>
                <th>Phone</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map((member) => {
                const isPrimaryAdmin = member.role === 'admin';
                const avatarBg = ROLE_COLORS[member.role] || '#6B7280';

                return (
                  <tr key={member.id}>
                    <td>
                      <div className={styles.staffIdentity}>
                        <div className={styles.avatar} style={{ backgroundColor: avatarBg }}>
                          {getInitials(member.full_name || 'Staff')}
                        </div>
                        <div>
                          <span className={styles.staffName}>
                            {member.full_name}
                            {isPrimaryAdmin && (
                              <Badge variant="warning" size="sm">Director</Badge>
                            )}
                          </span>
                          <span className={styles.staffEmail}>{member.email}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      {member.role === 'driver' ? (
                        <Badge variant="delivered" size="sm">🚐 Van Delivery Driver</Badge>
                      ) : member.role === 'intake_staff' ? (
                        <Badge variant="cleaning" size="sm">⚖️ Intake Specialist</Badge>
                      ) : (
                        <Badge variant="warning" size="sm">⚡ Operations Director</Badge>
                      )}
                    </td>

                    <td style={{ color: 'var(--color-gray-700)', fontSize: 'var(--text-xs)' }}>
                      {member.phone || '—'}
                    </td>

                    <td>
                      {member.is_active ? (
                        <span className={styles.statusActive}>
                          <span className={styles.statusDot} style={{ background: '#10B981' }} />
                          Active
                        </span>
                      ) : (
                        <span className={styles.statusDeactivated}>
                          <span className={styles.statusDot} style={{ background: '#EF4444' }} />
                          Deactivated
                        </span>
                      )}
                    </td>

                    <td>
                      <div className={styles.actionsCell}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingStaff(member)}
                        >
                          ✏️ Edit
                        </Button>

                        {!isPrimaryAdmin && (
                          <Button
                            variant={member.is_active ? 'ghost' : 'outline'}
                            size="sm"
                            style={{
                              color: member.is_active ? '#DC2626' : '#059669',
                              borderColor: member.is_active ? 'transparent' : '#A7F3D0',
                            }}
                            onClick={() => handleToggleActive(member)}
                            disabled={updateStaff.isPending}
                          >
                            {member.is_active ? '⛔ Deactivate' : '✅ Activate'}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Staff Modal */}
      <AddStaffModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />

      {/* Edit Staff Modal */}
      <EditStaffModal
        staff={editingStaff}
        onClose={() => setEditingStaff(null)}
      />
    </div>
  );
}
