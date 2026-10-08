'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Badge, Button, ButtonLink, Card, Loader } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import { ROUTES } from '@/lib/constants';
import { formatLongDate } from '@/lib/coverage';
import { CADENCE_LABEL, ROUTINE_MAX_PAUSE_WEEKS, windowText, type RoutineCadence, type RoutineChange } from '@/lib/routine';
import styles from './page.module.css';

/**
 * The customer's Routine (client 2026-10-08): next pickup, skip it, pause up to 8 weeks,
 * resume, change plan/day/window, or cancel (no fee).
 */
interface RoutineView {
  membership: {
    status: 'active' | 'paused';
    cadence: RoutineCadence;
    pickup_day: string;
    pickup_window: string;
    next_pickup_date: string | null;
    paused_until: string | null;
    consecutive_skips: number;
  } | null;
  address?: { street: string; unit: string | null; city: string; zip: string } | null;
  /** The next pickup: one already made (2 days ahead), else the next on the schedule */
  upcomingPickup?: string | null;
  allowedDays?: string[];
  zoneName?: string;
}

export default function RoutinePage() {
  const addToast = useUIStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['routine-membership'],
    queryFn: async (): Promise<RoutineView> => {
      const res = await fetch('/api/routine');
      if (!res.ok) throw new Error('Could not load your Routine');
      return res.json();
    },
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [pauseWeeks, setPauseWeeks] = useState(2);
  const [edit, setEdit] = useState<{ cadence: RoutineCadence; pickup_day: string; pickup_window: 'morning' | 'evening' } | null>(null);

  const change = async (body: RoutineChange, done: string) => {
    setBusy(body.action);
    try {
      const res = await fetch('/api/routine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'That did not work. Please try again.');
      addToast({
        type: 'success',
        title: result.autoPaused ? 'Routine paused' : done,
        message: result.autoPaused ? "That's 3 skips in a row, so we've paused your Routine. Resume anytime." : undefined,
      });
      setEdit(null);
      await queryClient.invalidateQueries({ queryKey: ['routine-membership'] });
    } catch (err) {
      addToast({ type: 'error', title: 'Not changed', message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const m = data?.membership;
  const upcoming = data?.upcomingPickup ?? m?.next_pickup_date ?? null;

  return (
    <AuthGuard allowedRoles={['admin', 'customer']}>
      <div className={styles.page}>
        <div className={styles.container}>
          <Link href={ROUTES.dashboard} className={styles.backLink}>
            ← Back to dashboard
          </Link>
          <div>
            <h1 className={styles.title}>Your Routine</h1>
            <p className={styles.subtitle}>A standing pickup. Skip, pause or cancel anytime, no fee.</p>
          </div>

          {isLoading ? (
            <Loader />
          ) : !m ? (
            <Card variant="bordered" padding="lg" className={styles.card}>
              <h2 className={styles.cardTitle}>You&apos;re not in the Routine yet</h2>
              <p className={styles.note}>
                Choose Weekly Routine (save 10%) or Bi-Weekly Routine (save 5%) when you book, and we&apos;ll pick up on the same day every week or two.
              </p>
              <ButtonLink href={ROUTES.book} variant="primary" size="sm" style={{ marginTop: 'var(--space-3)' }}>
                Book and join
              </ButtonLink>
            </Card>
          ) : (
            <>
              <Card variant="bordered" padding="lg" className={styles.card}>
                <h2 className={styles.cardTitle}>
                  {CADENCE_LABEL[m.cadence]} Routine{' '}
                  {m.status === 'paused' ? <Badge variant="warning">Paused</Badge> : <Badge variant="success">Active</Badge>}
                </h2>
                <dl className={styles.facts}>
                  <div>
                    <dt>Pickup</dt>
                    <dd>{m.pickup_day}s, {windowText(m.pickup_window)}</dd>
                  </div>
                  <div>
                    <dt>{m.status === 'paused' ? 'Paused until' : 'Next pickup'}</dt>
                    <dd>
                      {m.status === 'paused'
                        ? m.paused_until ? formatLongDate(m.paused_until) : 'You resume it'
                        : upcoming ? formatLongDate(upcoming) : '—'}
                    </dd>
                  </div>
                  {data?.address && (
                    <div>
                      <dt>Address</dt>
                      <dd>{[data.address.street, data.address.unit].filter(Boolean).join(', ')}, {data.address.city} {data.address.zip}</dd>
                    </div>
                  )}
                </dl>
                {m.consecutive_skips > 0 && m.status === 'active' && (
                  <p className={styles.note}>You&apos;ve skipped {m.consecutive_skips} in a row. Three in a row pauses your Routine.</p>
                )}
              </Card>

              <Card variant="bordered" padding="lg" className={styles.card}>
                <h2 className={styles.cardTitle}>{m.status === 'paused' ? 'Resume' : 'Skip or pause'}</h2>
                {m.status === 'paused' ? (
                  <div className={styles.actions}>
                    <Button variant="primary" size="sm" isLoading={busy === 'resume'} onClick={() => change({ action: 'resume' }, 'Routine resumed')}>
                      Resume my Routine
                    </Button>
                  </div>
                ) : (
                  <div className={styles.actions}>
                    <Button
                      variant="outline"
                      size="sm"
                      isLoading={busy === 'skip'}
                      disabled={!upcoming}
                      onClick={() => change({ action: 'skip' }, 'Pickup skipped')}
                    >
                      Skip {upcoming ? formatLongDate(upcoming) : 'next pickup'}
                    </Button>
                    <label className={styles.field}>
                      Pause for
                      <select value={pauseWeeks} onChange={(e) => setPauseWeeks(Number(e.target.value))}>
                        {Array.from({ length: ROUTINE_MAX_PAUSE_WEEKS }, (_, i) => i + 1).map((w) => (
                          <option key={w} value={w}>
                            {w} week{w > 1 ? 's' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button variant="outline" size="sm" isLoading={busy === 'pause'} onClick={() => change({ action: 'pause', weeks: pauseWeeks }, 'Routine paused')}>
                      Pause
                    </Button>
                  </div>
                )}
                <p className={styles.note}>You can also reply SKIP to the reminder we text 2 days before each pickup.</p>
              </Card>

              <Card variant="bordered" padding="lg" className={styles.card}>
                <h2 className={styles.cardTitle}>Change your plan</h2>
                {!edit ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEdit({ cadence: m.cadence, pickup_day: m.pickup_day, pickup_window: m.pickup_window === 'evening' ? 'evening' : 'morning' })}
                  >
                    Change plan, day or window
                  </Button>
                ) : (
                  <div className={styles.actions}>
                    <label className={styles.field}>
                      Plan
                      <select value={edit.cadence} onChange={(e) => setEdit({ ...edit, cadence: e.target.value as RoutineCadence })}>
                        <option value="weekly">Weekly (save 10%)</option>
                        <option value="biweekly">Bi-Weekly (save 5%)</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      Day
                      <select value={edit.pickup_day} onChange={(e) => setEdit({ ...edit, pickup_day: e.target.value })}>
                        {(data?.allowedDays || [m.pickup_day]).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      Window
                      <select value={edit.pickup_window} onChange={(e) => setEdit({ ...edit, pickup_window: e.target.value as 'morning' | 'evening' })}>
                        <option value="morning">Morning, 7:30 to 10:00 AM</option>
                        <option value="evening">Evening, 5:00 to 8:00 PM</option>
                      </select>
                    </label>
                    <Button variant="primary" size="sm" isLoading={busy === 'update'} onClick={() => change({ action: 'update', ...edit }, 'Routine updated')}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEdit(null)}>
                      Keep as is
                    </Button>
                  </div>
                )}
              </Card>

              <Card variant="bordered" padding="lg" className={styles.card}>
                <h2 className={styles.cardTitle}>Cancel</h2>
                <p className={styles.note}>Cancel anytime, no fee. Pickups already made for the coming days are cancelled too.</p>
                <Button
                  variant="danger"
                  size="sm"
                  style={{ marginTop: 'var(--space-3)' }}
                  isLoading={busy === 'cancel'}
                  onClick={() => {
                    if (window.confirm('Cancel your Routine? You can join again anytime when you book.')) change({ action: 'cancel' }, 'Routine cancelled');
                  }}
                >
                  Cancel my Routine
                </Button>
              </Card>
            </>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
