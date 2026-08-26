'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Button, Input, Card } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import styles from './page.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const { resetPassword } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const res = await resetPassword(email);
    setIsSubmitting(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSubmitted(true);
    }
  };

  return (
    <div className={styles.container}>
      <Card variant="bordered" padding="lg" className={styles.authCard}>
        <div className={styles.header}>
          <span className={styles.logoIcon}>🔑</span>
          <h1 className={styles.title}>Reset Password</h1>
          <p className={styles.subtitle}>Enter your email address to receive password reset instructions</p>
        </div>

        {submitted ? (
          <div className={styles.successState}>
            <div className={styles.successIcon}>✉️</div>
            <h3>Check Your Email</h3>
            <p>
              We&apos;ve sent password reset instructions to <strong>{email}</strong> if an account exists with that address.
            </p>
            <Link href={ROUTES.login}>
              <Button variant="primary" fullWidth style={{ marginTop: 'var(--space-4)' }}>
                Return to Log In
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
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />

              <Button type="submit" variant="primary" fullWidth isLoading={isSubmitting} size="lg">
                Send Reset Link
              </Button>
            </form>

            <div className={styles.footer}>
              <Link href={ROUTES.login} className={styles.backLink}>
                ← Back to Log In
              </Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
