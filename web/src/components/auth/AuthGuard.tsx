'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader } from '@/components/ui';
import { ROUTES } from '@/lib/constants';

interface AuthGuardProps {
  children: ReactNode;
  allowedRoles?: Array<'customer' | 'staff' | 'admin'>;
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
    return <Loader fullScreen text="Checking access..." />;
  }

  if (!isAuthenticated) {
    return null;
  }

  // Check role if specified
  const userRole = (user as unknown as { role?: string })?.role || 'customer';
  if (allowedRoles && !allowedRoles.includes(userRole as 'customer' | 'staff' | 'admin')) {
    return (
      <div style={{ padding: 'var(--space-12)', textAlign: 'center' }}>
        <h2>Access Restricted</h2>
        <p style={{ color: 'var(--color-gray-600)', marginTop: 'var(--space-2)' }}>
          You do not have permission to view this operational page.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
