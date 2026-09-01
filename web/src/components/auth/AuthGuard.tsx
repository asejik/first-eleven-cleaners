'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader, Button } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import type { UserRole } from '@/types';

interface AuthGuardProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(ROUTES.login);
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
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
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)', backgroundColor: '#f8fafc' }}>
        <div style={{ maxWidth: '480px', width: '100%', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '36px 28px', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
          <h2 style={{ color: 'var(--color-navy)', fontSize: '22px', margin: '0 0 8px' }}>Access Restricted</h2>
          <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.5, margin: '0 0 20px' }}>
            Your account role (<strong>{userRole.toUpperCase()}</strong>) does not have permission to view this operational area.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
