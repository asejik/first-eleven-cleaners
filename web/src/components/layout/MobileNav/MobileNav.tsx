'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/lib/constants';
import styles from './MobileNav.module.css';

const emptySubscribe = () => () => {};

export function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isMounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const isAdmin = isMounted && user?.role === 'admin';

  if (isAdmin) {
    const isMC = pathname === '/mission-control';
    const isIntake = pathname.startsWith('/mission-control/intake');
    const isDriver = pathname.startsWith('/staff/driver');
    const isPreview = pathname.startsWith('/dashboard');

    return (
      <nav className={styles.nav} aria-label="Admin Operational Navigation Bar">
        {/* Mission Control */}
        <Link
          href={ROUTES.missionControl}
          className={`${styles.item} ${isMC ? styles.itemActive : ''}`}
          aria-current={isMC ? 'page' : undefined}
        >
          <span className={styles.icon}>⚡</span>
          <span>Ops</span>
        </Link>

        {/* Intake Center (Center Button) */}
        <Link
          href={ROUTES.intake}
          className={styles.centerItem}
          aria-label="Intake Station"
          aria-current={isIntake ? 'page' : undefined}
        >
          <div className={styles.centerButton}>
            ⚖️
          </div>
          <span className={styles.centerLabel}>Intake</span>
        </Link>

        {/* Driver Manifest */}
        <Link
          href={ROUTES.staffDriver}
          className={`${styles.item} ${isDriver ? styles.itemActive : ''}`}
          aria-current={isDriver ? 'page' : undefined}
        >
          <span className={styles.icon}>🚐</span>
          <span>Driver</span>
        </Link>

        {/* Customer Portal Preview */}
        <Link
          href={`${ROUTES.dashboard}?view=customer`}
          className={`${styles.item} ${isPreview ? styles.itemActive : ''}`}
          aria-current={isPreview ? 'page' : undefined}
        >
          <span className={styles.icon}>👤</span>
          <span>Customer</span>
        </Link>
      </nav>
    );
  }

  // Customer or Guest Navigation
  const isHome = pathname === '/';
  const isBook = pathname.startsWith('/book');
  const isOrders = pathname === '/dashboard' || pathname.startsWith('/dashboard/orders');
  const isProfile =
    pathname === '/dashboard/profile' ||
    pathname.startsWith('/dashboard/preferences') ||
    pathname.startsWith('/dashboard/addresses');

  return (
    <nav className={styles.nav} aria-label="Mobile Navigation Bar">
      {/* Home */}
      <Link
        href={ROUTES.home}
        className={`${styles.item} ${isHome ? styles.itemActive : ''}`}
        aria-current={isHome ? 'page' : undefined}
      >
        <span className={styles.icon}>🏠</span>
        <span>Home</span>
      </Link>

      {/* Book Pickup (Elevated Center Action) */}
      <Link
        href={ROUTES.book}
        className={styles.centerItem}
        aria-label="Schedule a Pickup"
      >
        <div className={styles.centerButton}>
          🧺
        </div>
        <span className={styles.centerLabel}>Book</span>
      </Link>

      {/* Orders / Tracking */}
      <Link
        href={ROUTES.dashboard}
        className={`${styles.item} ${isOrders && !isBook ? styles.itemActive : ''}`}
        aria-current={isOrders ? 'page' : undefined}
      >
        <span className={styles.icon}>📦</span>
        <span>Orders</span>
      </Link>

      {/* Profile */}
      <Link
        href={ROUTES.profile}
        className={`${styles.item} ${isProfile ? styles.itemActive : ''}`}
        aria-current={isProfile ? 'page' : undefined}
      >
        <span className={styles.icon}>👤</span>
        <span>Account</span>
      </Link>
    </nav>
  );
}
