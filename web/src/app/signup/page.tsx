'use client';

import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore } from '@/stores/ui-store';
import { Button, Input, Card, ButtonLink } from '@/components/ui';
import { SmsConsentBlock } from '@/components/compliance';
import { ROUTES, PROMO_CODE_LAUNCH, PROMO_DISCOUNT_PERCENT } from '@/lib/constants';
import { passwordProblem, PASSWORD_HINT } from '@/lib/auth-messages';
import styles from './page.module.css';

// The account link in a guest's confirmation email carries their email (P05 AR-14)
function EmailFromLink({ onEmail }: { onEmail: (email: string) => void }) {
  const searchParams = useSearchParams();
  const linkedEmail = searchParams.get('email');
  useEffect(() => {
    if (linkedEmail) onEmail(linkedEmail);
  }, [linkedEmail, onEmail]);
  return null;
}

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const prefillEmail = useCallback((linked: string) => setEmail((current) => current || linked), []);
  const [phone, setPhone] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [smsPromotionsConsent, setSmsPromotionsConsent] = useState(false);
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const { signup } = useAuth();
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

    setIsSubmitting(true);
    const res = await signup({
      full_name: fullName,
      email,
      phone,
      password,
      sms_consent: smsConsent,
      sms_promotions_consent: smsPromotionsConsent,
    });
    if (res.error) {
      setIsSubmitting(false);
      setError(res.error);
      return;
    }

    // Trigger and await transactional welcome email with promo code
    try {
      await fetch('/api/auth/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fullName, email }),
        keepalive: true,
      });
    } catch (triggerErr) {
      console.warn('Welcome email trigger notice:', triggerErr);
    }

    setIsSubmitting(false);

    // Email confirmation required: the account can't be used until the link is clicked (SEC-28)
    if (res.needsConfirmation) {
      setAwaitingConfirmation(true);
      return;
    }

    addToast({
      type: 'success',
      title: 'Account Created!',
      message: `Welcome to First Eleven Cleaners! Use code ${PROMO_CODE_LAUNCH} for ${PROMO_DISCOUNT_PERCENT}% off.`,
    });
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
          <h1 className={styles.title}>Join the Starting Lineup</h1>
          <p className={styles.subtitle}>
            Create your account and claim {PROMO_DISCOUNT_PERCENT}% off with code <strong>{PROMO_CODE_LAUNCH}</strong>
          </p>
        </div>

        {awaitingConfirmation ? (
          <div className={styles.successState}>
            <div className={styles.successIcon}>✉️</div>
            <h3>Confirm Your Email</h3>
            <p>
              We&apos;ve sent a confirmation link to <strong>{email}</strong>. Click it to activate your account,
              then you&apos;ll be signed in automatically.
            </p>
            <ButtonLink href={ROUTES.login} variant="primary" fullWidth style={{ marginTop: 'var(--space-4)' }}>
              Go to Log In
            </ButtonLink>
          </div>
        ) : (
        <>
        {error && (
          <div className={styles.errorAlert} role="alert">
            {error}
          </div>
        )}

        <Suspense fallback={null}>
          <EmailFromLink onEmail={prefillEmail} />
        </Suspense>

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
            helperText="Used for driver coordination, dispatch alerts, and contactless delivery receipts"
          />

          <SmsConsentBlock
            smsConsent={smsConsent}
            onSmsConsentChange={setSmsConsent}
            smsPromotionsConsent={smsPromotionsConsent}
            onSmsPromotionsConsentChange={setSmsPromotionsConsent}
            idPrefix="signup"
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            helperText={PASSWORD_HINT}
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
        </>
        )}
      </Card>
    </div>
  );
}
