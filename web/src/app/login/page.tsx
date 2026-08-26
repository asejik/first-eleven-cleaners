'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore } from '@/stores/ui-store';
import { Button, Input, Card } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import styles from './page.module.css';

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
          <span className={styles.logoIcon}>⚽</span>
          <h1 className={styles.title}>Welcome Back</h1>
          <p className={styles.subtitle}>Log in to track your garments and manage pickups</p>
        </div>

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
