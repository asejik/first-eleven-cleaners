'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore } from '@/stores/ui-store';
import { Button, Input, Card } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import { passwordProblem, PASSWORD_HINT } from '@/lib/auth-messages';
import styles from '../forgot-password/page.module.css';

/**
 * Set a new password after following a password-reset email (SEC-28).
 * /auth/confirm verifies the reset link and signs the user in before redirecting here.
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { isAuthenticated, isLoading, updatePassword } = useAuth();
  const addToast = useUIStore((s) => s.addToast);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const weak = passwordProblem(password); // the project's Supabase password rule (P05 AR-11)
    if (weak) {
      setError(weak);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const res = await updatePassword(password);
    setIsSubmitting(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    addToast({ type: 'success', title: 'Password Updated', message: 'Your new password is saved.' });
    router.push(ROUTES.dashboard);
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
          <h1 className={styles.title}>Set a New Password</h1>
          <p className={styles.subtitle}>Choose a new password for your account</p>
        </div>

        {!isLoading && !isAuthenticated ? (
          <div className={styles.successState}>
            <div className={styles.successIcon}>⏱️</div>
            <h3>Link Expired</h3>
            <p>This password reset link is no longer valid. Request a new one to continue.</p>
            <Link href="/forgot-password">
              <Button variant="primary" fullWidth style={{ marginTop: 'var(--space-4)' }}>
                Request a New Link
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className={styles.errorAlert} role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
              <Input
                label="New Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                helperText={PASSWORD_HINT}
                required
                autoComplete="new-password"
              />
              <Input
                label="Confirm New Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                required
                autoComplete="new-password"
              />

              <Button type="submit" variant="primary" fullWidth isLoading={isSubmitting} size="lg">
                Save New Password
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
