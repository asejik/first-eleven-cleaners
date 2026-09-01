'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore } from '@/stores/ui-store';
import { Button, Input, Card } from '@/components/ui';
import { ROUTES, PROMO_CODE_LAUNCH, PROMO_DISCOUNT_PERCENT } from '@/lib/constants';
import styles from './page.module.css';

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { signup } = useAuth();
  const addToast = useUIStore((s) => s.addToast);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);
    const res = await signup({
      full_name: fullName,
      email,
      phone,
      password,
    });
    setIsSubmitting(false);

    if (res.error) {
      setError(res.error);
    } else {
      addToast({
        type: 'success',
        title: 'Account Created!',
        message: `Welcome to First Eleven Cleaners! Use code ${PROMO_CODE_LAUNCH} for ${PROMO_DISCOUNT_PERCENT}% off.`,
      });
      router.push(ROUTES.dashboard);
    }
  };

  return (
    <div className={styles.container}>
      <Card variant="bordered" padding="lg" className={styles.authCard}>
        <div className={styles.header}>
          <Link href={ROUTES.home} style={{ display: 'inline-block', marginBottom: 'var(--space-3)' }}>
            <Image
              src="/logo.png?v=2"
              alt="First Eleven Cleaners"
              width={200}
              height={50}
              priority
              unoptimized
              style={{ height: '44px', width: 'auto', margin: '0 auto', objectFit: 'contain' }}
            />
          </Link>
          <h1 className={styles.title}>Join the Starting Lineup</h1>
          <p className={styles.subtitle}>
            Create your account and claim {PROMO_DISCOUNT_PERCENT}% off with code <strong>{PROMO_CODE_LAUNCH}</strong>
          </p>
        </div>

        {error && (
          <div className={styles.errorAlert} role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <Input
            label="Full Name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="John Doe"
            required
            autoComplete="name"
          />

          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />

          <Input
            label="Phone Number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(214) 555-0123"
            required
            autoComplete="tel"
            helperText="Used for automated pickup & delivery SMS alerts"
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            autoComplete="new-password"
          />

          <Button type="submit" variant="primary" fullWidth isLoading={isSubmitting} size="lg">
            Create Account & Get 15% Off
          </Button>
        </form>

        <div className={styles.footer}>
          <p>
            Already have an account?{' '}
            <Link href={ROUTES.login} className={styles.loginLink}>
              Log in
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
