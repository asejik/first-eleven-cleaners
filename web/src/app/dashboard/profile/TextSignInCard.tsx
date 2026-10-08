'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Input } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import styles from './page.module.css';

/**
 * Text-code sign-in (client 2026-10-08): the customer proves the phone on their account once,
 * then can sign in with a texted code. Changing the phone turns it off until verified again.
 */
export function TextSignInCard() {
  const addToast = useUIStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['phone-verification'],
    queryFn: async (): Promise<{ phone: string | null; verified: boolean }> => {
      const res = await fetch('/api/auth/phone-verification');
      if (!res.ok) throw new Error('Could not load');
      return res.json();
    },
  });
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const call = async (body: Record<string, string>) => {
    setBusy(true);
    try {
      const res = await fetch('/api/auth/phone-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Something went wrong.');
      return true;
    } catch (err) {
      addToast({ type: 'error', title: 'Not done', message: (err as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (await call({ action: 'send' })) {
      setCodeSent(true);
      addToast({ type: 'success', title: 'Code sent', message: 'Check your phone for a 6-digit code.' });
    }
  };

  const confirm = async () => {
    if (await call({ action: 'confirm', code })) {
      setCodeSent(false);
      setCode('');
      addToast({ type: 'success', title: 'Phone verified', message: 'You can now sign in with a text code.' });
      await queryClient.invalidateQueries({ queryKey: ['phone-verification'] });
    }
  };

  return (
    <Card variant="bordered" padding="lg" className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>📱 Text Sign-In</h2>
        {data?.verified && <Badge variant="success">On</Badge>}
      </div>
      <div className={styles.cardBody} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {!data ? (
          <p>Loading…</p>
        ) : data.verified ? (
          <p>Your phone {data.phone} is verified. Sign in anytime with a texted code, no password needed.</p>
        ) : !data.phone ? (
          <p>Add a mobile number to your details to sign in with a texted code.</p>
        ) : !codeSent ? (
          <>
            <p>Verify {data.phone} once, then sign in anytime with a texted code instead of a password.</p>
            <Button variant="outline" size="sm" onClick={send} isLoading={busy}>
              Text me a code
            </Button>
          </>
        ) : (
          <>
            <Input
              id="text-sign-in-code"
              label="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            <Button variant="primary" size="sm" onClick={confirm} isLoading={busy} disabled={code.length !== 6}>
              Verify phone
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
