'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  CalendarPlus,
  Package,
  User,
  Zap,
  Scale,
  Truck,
} from 'lucide-react';
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
          <Zap className={styles.icon} size={20} strokeWidth={isMC ? 2.2 : 1.7} />
          <span className={styles.label}>Ops</span>
        </Link>

        {/* Intake Center */}
        <Link
          href={ROUTES.intake}
          className={`${styles.item} ${isIntake ? styles.itemActive : ''}`}
          aria-current={isIntake ? 'page' : undefined}
        >
          <Scale className={styles.icon} size={20} strokeWidth={isIntake ? 2.2 : 1.7} />
          <span className={styles.label}>Intake</span>
        </Link>

        {/* Driver Manifest */}
        <Link
          href={ROUTES.staffDriver}
          className={`${styles.item} ${isDriver ? styles.itemActive : ''}`}
          aria-current={isDriver ? 'page' : undefined}
        >
          <Truck className={styles.icon} size={20} strokeWidth={isDriver ? 2.2 : 1.7} />
          <span className={styles.label}>Driver</span>
        </Link>

        {/* Customer Portal Preview */}
        <Link
          href={`${ROUTES.dashboard}?view=customer`}
          className={`${styles.item} ${isPreview ? styles.itemActive : ''}`}
          aria-current={isPreview ? 'page' : undefined}
        >
          <User className={styles.icon} size={20} strokeWidth={isPreview ? 2.2 : 1.7} />
          <span className={styles.label}>Customer</span>
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
        <Home className={styles.icon} size={20} strokeWidth={isHome ? 2.2 : 1.7} />
        <span className={styles.label}>Home</span>
      </Link>

      {/* Book Pickup */}
      <Link
        href={ROUTES.book}
        className={`${styles.item} ${isBook ? styles.itemActive : ''}`}
        aria-current={isBook ? 'page' : undefined}
      >
        <CalendarPlus className={styles.icon} size={20} strokeWidth={isBook ? 2.2 : 1.7} />
        <span className={styles.label}>Book</span>
      </Link>

      {/* Orders / Tracking */}
      <Link
        href={ROUTES.dashboard}
        className={`${styles.item} ${isOrders && !isBook ? styles.itemActive : ''}`}
        aria-current={isOrders && !isBook ? 'page' : undefined}
      >
        <Package className={styles.icon} size={20} strokeWidth={isOrders && !isBook ? 2.2 : 1.7} />
        <span className={styles.label}>Orders</span>
      </Link>

      {/* Account / Profile */}
      <Link
        href={ROUTES.profile}
        className={`${styles.item} ${isProfile ? styles.itemActive : ''}`}
        aria-current={isProfile ? 'page' : undefined}
      >
        <User className={styles.icon} size={20} strokeWidth={isProfile ? 2.2 : 1.7} />
        <span className={styles.label}>Account</span>
      </Link>
    </nav>
  );
}
