import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bookingAddressFields, defaultAddress, isSameAddress, savedAddressText, splitAddressLabel } from '@/lib/saved-addresses';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#13): "Returning-customer convenience ... Enable saved customer
// details where available." A signed-in customer's saved addresses fill the booking form.
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const home = { id: 'a1', street: '9 Elm St', unit: 'Apt 2', city: 'Plano', zip: '75024', delivery_notes: '[Home] Gate 1100', is_default: false };
const office = { id: 'a2', street: '100 Main St', unit: null, city: 'Dallas', zip: '75201', delivery_notes: null, is_default: true };

describe('Saved addresses at booking', () => {
  it('the Addresses page tag is shown, not typed into the delivery notes', () => {
    expect(splitAddressLabel('[Home] Gate 1100')).toEqual({ label: 'Home', notes: 'Gate 1100' });
    expect(splitAddressLabel('[Office]')).toEqual({ label: 'Office', notes: '' });
    expect(splitAddressLabel('Leave at the door')).toEqual({ label: null, notes: 'Leave at the door' });
    expect(splitAddressLabel(null)).toEqual({ label: null, notes: '' });
    expect(bookingAddressFields(home)).toEqual({ street: '9 Elm St', unit: 'Apt 2', city: 'Plano', zip: '75024', deliveryNotes: 'Gate 1100' });
    expect(bookingAddressFields(office).unit).toBe('');
  });

  it('the default address comes first, else the newest', () => {
    expect(defaultAddress([home, office])).toBe(office);
    expect(defaultAddress([home])).toBe(home);
    expect(defaultAddress([])).toBeNull();
  });

  it('reads as one line, and matches the form the way the booking API does', () => {
    expect(savedAddressText(home)).toBe('9 Elm St, Apt 2, Plano 75024');
    expect(savedAddressText(office)).toBe('100 Main St, Dallas 75201');
    expect(isSameAddress(home, { street: ' 9 elm st ', zip: '75024' })).toBe(true);
    expect(isSameAddress(home, { street: '9 Elm St', zip: '75023' })).toBe(false);
  });

  it('booking loads them for signed-in customers and fills the default when the address is empty', () => {
    const state = read('src/hooks/useBookingState.ts');
    expect(state).toContain('useCustomerAddresses({ enabled: isCustomer })');
    expect(state).toContain('if (!street.trim() && !zip.trim()) applySavedAddress(defaultAddress(savedAddresses))');
    const step = read('src/components/booking/StepAddress.tsx');
    expect(step).toContain('Your saved addresses');
    expect(step).toContain('onClick={() => onUseSavedAddress(a)}');
    expect(step).toContain('aria-pressed={selected}');
  });
});
