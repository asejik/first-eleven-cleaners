'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, ButtonLink, Card } from '@/components/ui';
import { DRY_CLEAN_PRICES } from '@/lib/constants';
import styles from './page.module.css';

/**
 * One-tap rebook from the delivered text (client 2026-10-14): "Book next week's pickup?" The
 * page shows what will be booked and asks once, so a link preview can't book by itself. No
 * sign-in needed: the link is signed for that order.
 */
interface Plan {
  date: string;
  dateLabel: string;
  windowLabel: string;
  address: string;
  items: Array<{ garment_type: string; quantity: number }>;
  weightLbs: number;
  estimate: { subtotal: number; discount: number; total: number; hold: number };
  orderTwoDiscount: number;
  alreadyBooked: { id: string; order_number: string } | null;
}
type View =
  | { state: 'loading' }
  | { state: 'ready'; plan: Plan }
  | { state: 'done'; message: string; trackUrl: string }
  | { state: 'fallback'; message: string; next: string }
  | { state: 'error'; message: string };

const money = (n: number) => `$${n.toFixed(2)}`;

export default function RebookPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [view, setView] = useState<View>({ state: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/rebook?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) setView({ state: 'error', message: data.error || 'Could not load this link.' });
        else if (!data.ok) setView({ state: 'fallback', message: data.message, next: data.next || '/book' });
        else if (data.plan.alreadyBooked) {
          setView({ state: 'done', message: `You're already booked for ${data.plan.dateLabel}.`, trackUrl: `/track/${data.plan.alreadyBooked.id}` });
        } else setView({ state: 'ready', plan: data.plan });
      })
      .catch(() => alive && setView({ state: 'error', message: 'Could not load this link. Please try again.' }));
    return () => {
      alive = false;
    };
  }, [token]);

  const book = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/rebook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'That did not work. Please try again.');
      if (!data.ok) setView({ state: 'fallback', message: data.message, next: data.next || '/book' });
      else setView({ state: 'done', message: `You're booked for ${data.dateLabel}, ${data.windowLabel}. We'll text you before we come.`, trackUrl: data.trackUrl });
    } catch (err) {
      setView({ state: 'error', message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const itemsLine = (plan: Plan) =>
    [
      plan.weightLbs > 0 ? `About ${plan.weightLbs} lb wash & fold` : null,
      ...plan.items.map((i) => `${i.quantity} × ${DRY_CLEAN_PRICES[i.garment_type]?.label || i.garment_type}`),
    ]
      .filter(Boolean)
      .join(', ');

  return (
    <div className={styles.page}>
      <Card variant="bordered" padding="lg" className={styles.card}>
        <h1 className={styles.title}>Book next week&apos;s pickup?</h1>
        {view.state === 'loading' && <p>Loading…</p>}
        {view.state === 'ready' && (
          <>
            <p>
              <strong>{view.plan.dateLabel}</strong>, {view.plan.windowLabel}
              <br />
              {view.plan.address}
            </p>
            <p className={styles.small}>Same as last time: {itemsLine(view.plan)}.</p>
            <p>
              Estimate <strong>{money(view.plan.estimate.total)}</strong>
              {view.plan.orderTwoDiscount > 0 && <> (order two: {money(view.plan.orderTwoDiscount)} off)</>}. We weigh and itemize at intake, as always, and
              hold up to {money(view.plan.estimate.hold)} on your card on file 2 days before.
            </p>
            <Button variant="primary" fullWidth isLoading={busy} onClick={book}>
              Book it
            </Button>
          </>
        )}
        {view.state === 'done' && (
          <>
            <p role="status">{view.message}</p>
            <ButtonLink href={view.trackUrl} variant="outline" fullWidth>
              Track or change it
            </ButtonLink>
          </>
        )}
        {view.state === 'fallback' && (
          <>
            <p role="status">{view.message}</p>
            <ButtonLink href={view.next} variant="primary" fullWidth>
              {view.next === '/routine' ? 'Go to my Routine' : 'Book on the website'}
            </ButtonLink>
          </>
        )}
        {view.state === 'error' && <p role="status">{view.message}</p>}
        <p className={styles.small}>
          Want a different day or items? <Link href="/book">Book on the website</Link>.
        </p>
      </Card>
    </div>
  );
}
