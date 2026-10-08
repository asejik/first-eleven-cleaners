'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card } from '@/components/ui';
import { ROUTINE_PATH } from '@/lib/routine';
import styles from './page.module.css';

/**
 * One-tap skip from the Routine reminder text (client 2026-10-07). Asks once, so a link
 * preview can't skip by itself. No sign-in needed: the link is signed for that one pickup.
 */
type View = { state: 'loading' } | { state: 'ready'; pickupLabel: string } | { state: 'done'; message: string } | { state: 'error'; message: string };

export default function RoutineSkipPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [view, setView] = useState<View>({ state: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/routine/skip?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) setView({ state: 'error', message: data.error || 'This skip link is not valid.' });
        else if (!data.canSkip) setView({ state: 'done', message: data.status === 'cancelled' ? `Your pickup on ${data.pickupLabel} is already skipped.` : `Your pickup on ${data.pickupLabel} can't be skipped now.` });
        else setView({ state: 'ready', pickupLabel: data.pickupLabel });
      })
      .catch(() => alive && setView({ state: 'error', message: 'Could not load this link. Please try again.' }));
    return () => {
      alive = false;
    };
  }, [token]);

  const skip = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/routine/skip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'That did not work.');
      setView({
        state: 'done',
        message: data.autoPaused
          ? `Skipped. That's 3 in a row, so your Routine is paused. Nothing is charged while it's paused.`
          : `Skipped. Nothing is charged for ${data.pickupLabel}, and your Routine carries on as usual.`,
      });
    } catch (err) {
      setView({ state: 'error', message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <Card variant="bordered" padding="lg" className={styles.card}>
        <h1 className={styles.title}>Skip this pickup?</h1>
        {view.state === 'loading' && <p>Loading…</p>}
        {view.state === 'ready' && (
          <>
            <p>Your Routine pickup is on <strong>{view.pickupLabel}</strong>. Skipping this one doesn&apos;t cancel your Routine.</p>
            <Button variant="primary" fullWidth isLoading={busy} onClick={skip}>
              Skip {view.pickupLabel}
            </Button>
          </>
        )}
        {(view.state === 'done' || view.state === 'error') && <p role="status">{view.message}</p>}
        <p className={styles.small}>
          Manage your Routine anytime: <Link href={ROUTINE_PATH}>your Routine page</Link>
        </p>
      </Card>
    </div>
  );
}
