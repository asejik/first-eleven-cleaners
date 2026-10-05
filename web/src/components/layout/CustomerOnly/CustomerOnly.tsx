'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { isStaffRoute } from '@/lib/staff-routes';

/** Renders customer-facing chrome (footer, concierge) everywhere except staff screens (P05 AR-17). */
export function CustomerOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/';
  return isStaffRoute(pathname) ? null : <>{children}</>;
}
