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
type LateFee = { fee: number; waived: boolean; message: string } | null;
type View = { state: 'loading' } | { state: 'ready'; pickupLabel: string; lateFee: LateFee } | { state: 'done'; message: string } | { state: 'error'; message: string };

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
        else setView({ state: 'ready', pickupLabel: data.pickupLabel, lateFee: data.lateFee ?? null });
      })
      .catch(() => alive && setView({ state: 'error', message: 'Could not load this link. Please try again.' }));
    return () => {
      alive = false;
    };
  }, [token]);

  const skip = async () => {
    setBusy(true);
    try {
      // The fee (if any) was shown on the page, so tapping the button confirms it (2026-10-08)
      const res = await fetch('/api/routine/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, confirm_late_fee: view.state === 'ready' && Boolean(view.lateFee) }),
      });
      const data = await res.json();
      // It became late while the page was open: show the fee and let them decide
      if (res.status === 409 && data.code === 'LATE_CANCEL_FEE' && view.state === 'ready') {
        setView({ ...view, lateFee: { fee: data.fee, waived: data.waived, message: data.error } });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'That did not work.');
      const fee = data.lateCancel as { status: string; fee: number } | undefined;
      const feeLine =
        fee?.status === 'charged'
          ? ` The $${fee.fee.toFixed(2)} late-cancel fee was charged to your card.`
          : fee?.status === 'declined'
            ? ` We couldn't charge the $${fee.fee.toFixed(2)} late-cancel fee; we'll be in touch.`
            : fee?.status === 'waived'
              ? ' No late-cancel fee this time.'
              : ` Nothing is charged for ${data.pickupLabel}.`;
      setView({
        state: 'done',
        message: data.autoPaused
          ? `Skipped.${fee && fee.status !== 'none' ? feeLine : ''} That's 3 in a row, so your Routine is paused. Nothing is charged while it's paused.`
          : `Skipped.${feeLine} Your Routine carries on as usual.`,
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
            {view.lateFee && <p role="alert" className={styles.warning}>{view.lateFee.message}</p>}
            <Button variant="primary" fullWidth isLoading={busy} onClick={skip}>
              {view.lateFee && !view.lateFee.waived ? `Skip and pay $${view.lateFee.fee.toFixed(2)}` : `Skip ${view.pickupLabel}`}
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
