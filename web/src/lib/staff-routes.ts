import type { UserRole } from '@/types';

/** Staff-only areas (Mission Control, intake, driver), where customer chrome is hidden (P05 AR-17). */
const STAFF_PREFIXES = ['/mission-control', '/staff', '/admin', '/driver'];

export function isStaffRoute(pathname: string): boolean {
  return STAFF_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Roles allowed on each staff page, checked on the server by the proxy before the page loads
 * (client review 2026-10-20, #2). The data behind these pages is also checked by every API
 * route (verifyApiAuth); this keeps the pages themselves away from visitors too. Most specific
 * prefix first.
 */
const STAFF_PAGE_ROLES: ReadonlyArray<readonly [string, readonly UserRole[]]> = [
  ['/mission-control/intake', ['admin', 'intake_staff']],
  ['/mission-control', ['admin']],
  ['/admin', ['admin']],
  ['/staff', ['admin', 'driver']],
  ['/driver', ['admin', 'driver']],
];

/** The roles allowed on a staff page, or null for any other page. */
export function staffPageRoles(pathname: string): readonly UserRole[] | null {
  const match = STAFF_PAGE_ROLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return match ? match[1] : null;
}
