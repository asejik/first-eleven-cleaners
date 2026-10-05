/** Staff-only areas (Mission Control, intake, driver), where customer chrome is hidden (P05 AR-17). */
const STAFF_PREFIXES = ['/mission-control', '/staff', '/admin', '/driver'];

export function isStaffRoute(pathname: string): boolean {
  return STAFF_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
