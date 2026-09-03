'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader, Button } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import type { UserRole } from '@/types';

import styles from './AuthGuard.module.css';

interface AuthGuardProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

const emptySubscribe = () => () => {};

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const isMounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isMounted && !isLoading && !isAuthenticated) {
      router.push(ROUTES.login);
    }
  }, [isMounted, isLoading, isAuthenticated, router]);

  if (!isMounted || isLoading) {
    return <Loader fullScreen text="Verifying credentials & role authorization..." />;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const userRole: UserRole = user.role || 'customer';

  // Check role if specified
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    const roleDestination =
      userRole === 'driver'
        ? { label: 'Go to Driver App', href: ROUTES.staffDriver }
        : userRole === 'intake_staff'
        ? { label: 'Go to Central Intake', href: ROUTES.intake }
        : userRole === 'admin'
        ? { label: 'Go to Mission Control', href: ROUTES.missionControl }
        : { label: 'Go to Customer Portal', href: ROUTES.dashboard };

    return (
      <div className={styles.restrictedContainer}>
        <div className={styles.restrictedCard}>
          <div className={styles.restrictedIcon}>🔒</div>
          <h2 className={styles.restrictedTitle}>Access Restricted</h2>
          <p className={styles.restrictedDescription}>
            Your account role (<strong className={styles.roleHighlight}>{userRole.toUpperCase()}</strong>) does not have permission to view this operational area.
          </p>
          <div className={styles.actionButtons}>
            <Link href={roleDestination.href}>
              <Button variant="primary" fullWidth size="md">
                {roleDestination.label} →
              </Button>
            </Link>
            <Link href={ROUTES.home}>
              <Button variant="ghost" fullWidth size="sm">
                Return to Home Pitch
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
