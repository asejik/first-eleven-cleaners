import type { Customer, UserRole } from '@/types';

const MOCK_STORAGE_KEY = 'f11_mock_user';
const AUTH_CACHE_KEY = 'f11_auth_customer';
const AUTH_CACHE_TIME_KEY = 'f11_auth_timestamp';
const AUTH_TTL_MS = 4 * 60 * 1000; // 4-minute TTL cache

/**
 * Resolves user role from the server-controlled customers.role column only (SEC-02).
 * Email addresses and user-editable metadata never grant a role.
 */
export function determineRole(_email: string, _metaRole?: string, dbRole?: string): UserRole {
  if (dbRole && ['admin', 'driver', 'intake_staff', 'customer'].includes(dbRole)) {
    return dbRole as UserRole;
  }
  return 'customer';
}

/**
 * Local mock mode only (Supabase not configured): lets developers preview staff areas
 * by logging in with the company staff addresses. Never used with a real database.
 */
function mockRoleForEmail(email: string): UserRole {
  const clean = email.toLowerCase().trim();
  if (clean === 'admin@firstelevencleaners.com') return 'admin';
  if (clean === 'driver@firstelevencleaners.com') return 'driver';
  if (clean === 'intake@firstelevencleaners.com') return 'intake_staff';
  return 'customer';
}

/**
 * Checks whether a fresh cached customer session exists in localStorage.
 */
export function hasFreshCachedSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cached = localStorage.getItem(AUTH_CACHE_KEY) || localStorage.getItem(MOCK_STORAGE_KEY);
    const cachedTime = localStorage.getItem(AUTH_CACHE_TIME_KEY);
    if (cached && cachedTime && Date.now() - Number(cachedTime) < AUTH_TTL_MS) {
      return true;
    }
  } catch {}
  return false;
}

/**
 * Retrieves the stored or mock customer from local storage.
 */
export function getStoredCustomer(): Customer | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(AUTH_CACHE_KEY) || localStorage.getItem(MOCK_STORAGE_KEY);
    if (cached) {
      const parsed: Customer = JSON.parse(cached);
      if (!parsed.role) {
        parsed.role = determineRole(parsed.email);
      }
      return parsed;
    }
  } catch {}
  return null;
}

/**
 * Persists customer record to localStorage with fresh timestamp.
 */
export function saveStoredCustomer(customer: Customer): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(customer));
    localStorage.setItem(AUTH_CACHE_TIME_KEY, String(Date.now()));
  } catch {}
}

/**
 * Clears all cached customer and mock authentication tokens from local storage.
 */
export function clearStoredCustomer(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(AUTH_CACHE_KEY);
    localStorage.removeItem(AUTH_CACHE_TIME_KEY);
    localStorage.removeItem(MOCK_STORAGE_KEY);
    localStorage.removeItem('f11_customer_preferences');
  } catch {}
}

/**
 * Generates a mock Customer object for local development environments when Supabase is not configured.
 */
export function createMockCustomer(
  email: string,
  partial?: Partial<Customer>
): Customer {
  const role = partial?.role ? determineRole(email, undefined, partial.role) : mockRoleForEmail(email);
  return {
    id: partial?.id || 'c0000000-0000-0000-0000-000000000001',
    auth_id: partial?.auth_id || 'c0000000-0000-0000-0000-000000000001',
    email,
    phone: partial?.phone || '(214) 555-0199',
    full_name: partial?.full_name || email.split('@')[0].replace('.', ' ').toUpperCase() || 'Valued Customer',
    role,
    created_at: partial?.created_at || new Date().toISOString(),
    updated_at: partial?.updated_at || new Date().toISOString(),
  };
}
