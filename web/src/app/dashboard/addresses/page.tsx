'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button, Input, Card, Badge, Loader } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import { ROUTES } from '@/lib/constants';
import { useCustomerAddresses, useAddAddress, useSetDefaultAddress, useDeleteAddress } from '@/hooks/useAddresses';
import styles from './page.module.css';

export default function AddressesPage() {
  const { data, isLoading } = useCustomerAddresses();
  const addAddressMutation = useAddAddress();
  const setDefaultMutation = useSetDefaultAddress();
  const deleteAddressMutation = useDeleteAddress();

  const [isAdding, setIsAdding] = useState(false);
  const [labelTag, setLabelTag] = useState<'Home' | 'Office' | 'Concierge' | 'Other'>('Home');
  const [newStreet, setNewStreet] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newCity, setNewCity] = useState('Dallas');
  const [newState, setNewState] = useState('TX');
  const [newZip, setNewZip] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);

  const addToast = useUIStore((s) => s.addToast);

  const addresses = data?.addresses || [];

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultMutation.mutateAsync(id);
      addToast({ type: 'success', title: 'Default Address Updated' });
    } catch (err: unknown) {
      addToast({ type: 'error', title: 'Update Failed', message: (err as Error).message });
    }
  };

  const handleDelete = async (id: string, isDefault: boolean) => {
    if (addresses.length <= 1) {
      addToast({
        type: 'warning',
        title: 'Cannot Delete',
        message: 'You need at least one saved pickup address for your account.',
      });
      return;
    }
    if (confirm('Are you sure you want to delete this address?')) {
      try {
        await deleteAddressMutation.mutateAsync(id);
        addToast({ type: 'success', title: 'Address Removed' });
      } catch (err: unknown) {
        addToast({ type: 'error', title: 'Delete Failed', message: (err as Error).message });
      }
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStreet.trim() || !newZip.trim()) return;

    try {
      const formattedNotes = [
        labelTag !== 'Other' ? `[${labelTag}]` : '',
        newNotes.trim(),
      ]
        .filter(Boolean)
        .join(' ');

      await addAddressMutation.mutateAsync({
        street: newStreet,
        unit: newUnit || null,
        city: newCity,
        state: newState,
        zip: newZip,
        delivery_notes: formattedNotes || null,
        is_default: makeDefault || addresses.length === 0,
      });

      setIsAdding(false);
      setNewStreet('');
      setNewUnit('');
      setNewZip('');
      setNewNotes('');
      setMakeDefault(false);

      addToast({
        type: 'success',
        title: 'Address Saved',
        message: 'Your new pickup address is saved to your profile.',
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Failed to Save Address',
        message: (err as Error).message,
      });
    }
  };

  return (
    <AuthGuard allowedRoles={['admin', 'customer']}>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.topNav}>
            <Link href={ROUTES.profile} className={styles.backLink}>
              ← Back to Profile Settings
            </Link>
          </div>

          <div className={styles.headerRow}>
            <div>
              <h1 className={styles.title}>Saved Pickup Addresses</h1>
              <p className={styles.subtitle}>Manage your home, office, and concierge delivery locations across Dallas-Fort Worth.</p>
            </div>
            {!isAdding && (
              <Button variant="primary" onClick={() => setIsAdding(true)}>
                + Add New Address
              </Button>
            )}
          </div>

          {/* Add Address Form Card */}
          {isAdding && (
            <Card variant="bordered" padding="lg" className={styles.formCard}>
              <h2 className={styles.formTitle}>Add New Pickup & Delivery Location</h2>
              <form onSubmit={handleAddAddress} className={styles.form}>
                {/* Location Type Tags */}
                <div>
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', color: 'var(--color-navy)', display: 'block', marginBottom: '4px' }}>
                    Location Type
                  </label>
                  <div className={styles.tagRow}>
                    {(['Home', 'Office', 'Concierge', 'Other'] as const).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={`${styles.tagBtn} ${labelTag === tag ? styles.tagBtnActive : ''}`}
                        onClick={() => setLabelTag(tag)}
                      >
                        {tag === 'Home' ? '🏠 Home' : tag === 'Office' ? '🏢 Office' : tag === 'Concierge' ? '🛎️ Concierge' : '📍 Other'}
                      </button>
                    ))}
                  </div>
                </div>

                <Input
                  label="Street Address"
                  value={newStreet}
                  onChange={(e) => setNewStreet(e.target.value)}
                  placeholder="e.g. 2100 Ross Ave"
                  required
                />

                <div className={styles.rowTwo}>
                  <Input
                    label="Suite / Unit / Floor"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    placeholder="e.g. Suite 1800 or Apt 4B"
                  />
                  <Input
                    label="ZIP Code"
                    value={newZip}
                    onChange={(e) => setNewZip(e.target.value)}
                    placeholder="e.g. 75201"
                    required
                  />
                </div>

                <div className={styles.rowTwo}>
                  <Input
                    label="City"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    placeholder="Dallas"
                    required
                  />
                  <Input
                    label="State"
                    value={newState}
                    onChange={(e) => setNewState(e.target.value)}
                    placeholder="TX"
                    required
                  />
                </div>

                <Input
                  label="Delivery / Access Notes"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g. Drop with 18th floor reception desk, or leave in concierge parcel room"
                />

                <label className={styles.defaultCheckboxRow}>
                  <input
                    type="checkbox"
                    checked={makeDefault}
                    onChange={(e) => setMakeDefault(e.target.checked)}
                  />
                  <span>Set as my primary default pickup address</span>
                </label>

                <div className={styles.formActions}>
                  <Button variant="ghost" type="button" onClick={() => setIsAdding(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit" isLoading={addAddressMutation.isPending}>
                    Save Address to Profile
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Address List */}
          {isLoading ? (
            <Loader text="Loading your saved addresses..." />
          ) : addresses.length === 0 ? (
            <Card variant="surface" padding="lg" className={styles.emptyCard}>
              <h3>No Saved Addresses Yet</h3>
              <p style={{ color: 'var(--color-gray-500)', marginTop: '4px', marginBottom: '16px' }}>
                Add your home or office address to make scheduling pickups seamless.
              </p>
              <Button variant="primary" onClick={() => setIsAdding(true)}>
                + Add Your First Address
              </Button>
            </Card>
          ) : (
            <div className={styles.addressList}>
              {addresses.map((addr) => (
                <Card key={addr.id} variant="bordered" padding="md" className={styles.addrCard}>
                  <div className={styles.addrMain}>
                    <div className={styles.addrHeader}>
                      <span className={styles.streetName}>
                        {addr.street} {addr.unit && `(${addr.unit})`}
                      </span>
                      {addr.is_default && <Badge variant="success">Default</Badge>}
                    </div>
                    <p className={styles.cityState}>
                      {addr.city}, {addr.state} {addr.zip}
                    </p>
                    {addr.delivery_notes && (
                      <p className={styles.notesText}>
                        <strong>Instructions:</strong> {addr.delivery_notes}
                      </p>
                    )}
                  </div>
                  <div className={styles.addrActions}>
                    {!addr.is_default && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(addr.id)}
                        isLoading={setDefaultMutation.isPending}
                      >
                        Set as Default
                      </Button>
                    )}
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(addr.id, addr.is_default)}
                      title="Delete this address"
                      disabled={deleteAddressMutation.isPending}
                    >
                      🗑️
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
