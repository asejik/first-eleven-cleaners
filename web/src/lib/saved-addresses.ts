import type { Address } from '@/types';

/**
 * Saved addresses at booking (client review 2026-10-20, #13: "Enable saved customer details where
 * available"). The Addresses page stores its Home / Office / Concierge tag at the start of the
 * delivery notes ("[Home] Gate 1100"); booking shows the tag and fills in only the notes.
 */
const LABEL_TAG = /^\[(Home|Office|Concierge)\]\s*/;

export function splitAddressLabel(notes: string | null | undefined): { label: string | null; notes: string } {
  const text = (notes || '').trim();
  const match = text.match(LABEL_TAG);
  return match ? { label: match[1], notes: text.slice(match[0].length).trim() } : { label: null, notes: text };
}

/** The booking form's fields for a saved address */
export function bookingAddressFields(a: Pick<Address, 'street' | 'unit' | 'city' | 'zip' | 'delivery_notes'>) {
  return { street: a.street, unit: a.unit || '', city: a.city, zip: a.zip, deliveryNotes: splitAddressLabel(a.delivery_notes).notes };
}

/** The default address, else the newest (the API lists the default first) */
export function defaultAddress<T extends Pick<Address, 'is_default'>>(addresses: T[]): T | null {
  return addresses.find((a) => a.is_default) ?? addresses[0] ?? null;
}

/** "9 Elm St, Apt 2, Plano 75024" */
export function savedAddressText(a: Pick<Address, 'street' | 'unit' | 'city' | 'zip'>): string {
  return [a.street, a.unit, `${a.city} ${a.zip}`].filter(Boolean).join(', ');
}

/** The form holds this saved address: same street and ZIP, as /api/bookings matches them */
export function isSameAddress(a: Pick<Address, 'street' | 'zip'>, form: { street: string; zip: string }): boolean {
  return a.street.trim().toLowerCase() === form.street.trim().toLowerCase() && a.zip.trim() === form.zip.trim();
}
