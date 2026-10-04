'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore } from '@/stores/ui-store';
import { Button, Input, Card } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import styles from './page.module.css';

// Shown when /auth/confirm sends the user back after an invalid or expired email link (SEC-28)
function LinkExpiredNotice() {
  const searchParams = useSearchParams();
  if (searchParams.get('error') !== 'link_expired') return null;
  return (
    <div className={styles.errorAlert} role="alert">
      That email link is invalid or has expired. Log in below, or request a new link from{' '}
      <Link href="/forgot-password">Forgot password</Link>.
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();
  const addToast = useUIStore((s) => s.addToast);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const res = await login(email, password);
    setIsSubmitting(false);

    if (res.error) {
      setError(res.error);
    } else {
      addToast({
        type: 'success',
        title: 'Welcome back!',
        message: 'You have logged in successfully.',
      });
      if (res.role === 'admin' || email.includes('admin@')) {
        router.push(ROUTES.missionControl);
      } else if (res.role === 'driver' || email.includes('driver@')) {
        router.push(ROUTES.staffDriver);
      } else if (res.role === 'intake_staff' || email.includes('intake@')) {
        router.push(ROUTES.intake);
      } else {
        router.push(ROUTES.dashboard);
      }
    }
  };

  return (
    <div className={styles.container}>
      <Card variant="bordered" padding="lg" className={styles.authCard}>
        <div className={styles.header}>
          <Link href={ROUTES.home} style={{ display: 'inline-block', marginBottom: 'var(--space-3)' }}>
            <Image
              src="/logo.png"
              alt="First Eleven Cleaners"
              width={200}
              height={50}
              priority
              style={{ height: '44px', width: 'auto', margin: '0 auto', objectFit: 'contain' }}
            />
          </Link>
          <h1 className={styles.title}>Welcome Back</h1>
          <p className={styles.subtitle}>Log in to track your garments and manage pickups</p>
        </div>

        <Suspense fallback={null}>
          <LinkExpiredNotice />
        </Suspense>

        {error && (
          <div className={styles.errorAlert} role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />

          <div className={styles.passwordField}>
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
            <div className={styles.forgotLink}>
              <Link href="/forgot-password">Forgot password?</Link>
            </div>
          </div>

          <Button type="submit" variant="primary" fullWidth isLoading={isSubmitting} size="lg">
            Log In
          </Button>
        </form>

        <div className={styles.footer}>
          <p>
            Don&apos;t have an account?{' '}
            <Link href={ROUTES.signup} className={styles.signupLink}>
              Sign up for free
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
