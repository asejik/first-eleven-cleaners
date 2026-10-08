'use client';

import { useState, type FormEvent } from 'react';
import { Button, Input } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import styles from './page.module.css';

/**
 * Sign in without a password (client 2026-10-08): an email gets a link, a verified mobile
 * number gets a 6-digit code.
 */
export function PasswordlessSignIn() {
  const [identifier, setIdentifier] = useState('');
  const [step, setStep] = useState<'ask' | 'code' | 'sent'>('ask');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/passwordless/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send it. Please try again.');
      setMessage(data.message);
      if (data.channel === 'sms') {
        setPhone(data.phone);
        setStep('code');
      } else {
        setStep('sent');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/passwordless/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'That code did not work.');
      // A full load, so the new session cookies are picked up everywhere
      window.location.assign(data.redirect || ROUTES.dashboard);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className={styles.passwordless}>
      <h2 className={styles.passwordlessTitle}>Sign in without a password</h2>
      {error && (
        <div className={styles.errorAlert} role="alert">
          {error}
        </div>
      )}
      {step === 'ask' && (
        <form onSubmit={start} className={styles.form}>
          <Input
            label="Email or mobile number"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@example.com or (214) 555-0100"
            required
            autoComplete="username"
          />
          <Button type="submit" variant="outline" fullWidth isLoading={busy}>
            Email me a link or text me a code
          </Button>
          <p className={styles.passwordlessHint}>Text codes work once you&apos;ve verified your phone in your profile.</p>
        </form>
      )}
      {step === 'code' && (
        <form onSubmit={verify} className={styles.form}>
          <p className={styles.passwordlessHint} role="status">{message}</p>
          <Input
            label="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
          <Button type="submit" variant="primary" fullWidth isLoading={busy} disabled={code.length !== 6}>
            Sign in
          </Button>
          <button type="button" className={styles.linkButton} onClick={() => { setStep('ask'); setCode(''); setError(''); }}>
            Use a different email or number
          </button>
        </form>
      )}
      {step === 'sent' && (
        <div className={styles.form}>
          <p className={styles.passwordlessHint} role="status">{message}</p>
          <button type="button" className={styles.linkButton} onClick={() => setStep('ask')}>
            Use a different email or number
          </button>
        </div>
      )}
    </div>
  );
}
