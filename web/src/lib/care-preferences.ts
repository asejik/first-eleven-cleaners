import type { CustomerPreferences } from '@/types';

/**
 * The parts of a customer's saved Preferences each staff role needs (P05 AR-03).
 * Drivers: how to get in and where to leave the bag. Intake: how to clean it.
 */
const FIELDS = {
  driver: ['gate_code', 'delivery_instructions'],
  intake: ['starch_level', 'fold_vs_hang', 'detergent_sensitivity'],
} as const;

export type StaffRole = keyof typeof FIELDS;
export type StaffPreferences = Partial<Pick<CustomerPreferences, (typeof FIELDS)[StaffRole][number]>>;

/** PostgREST embeds the one-to-one preferences row as an object or a one-item array. */
function asRow(raw: unknown): Record<string, unknown> | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
}

/** Only this role's fields, with blanks dropped; null when there is nothing to show. */
export function staffPreferences(raw: unknown, role: StaffRole): StaffPreferences | null {
  const row = asRow(raw);
  if (!row) return null;
  const picked: Record<string, unknown> = {};
  for (const key of FIELDS[role]) {
    const value = row[key];
    if (typeof value === 'string' ? value.trim() !== '' : value != null) picked[key] = value;
  }
  return Object.keys(picked).length > 0 ? (picked as StaffPreferences) : null;
}

/** Replaces the embedded customer.preferences with the role's view of it. */
export function withStaffPreferences<T extends { customer?: unknown }>(order: T, role: StaffRole): T {
  const customer = order.customer as Record<string, unknown> | null | undefined;
  if (!customer || typeof customer !== 'object') return order;
  return { ...order, customer: { ...customer, preferences: staffPreferences(customer.preferences, role) } };
}
