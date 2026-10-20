'use client';

import { useQuery } from '@tanstack/react-query';
import { Repeat } from 'lucide-react';
import { ButtonLink, Card } from '@/components/ui';
import { formatLongDate } from '@/lib/coverage';
import { CADENCE_LABEL, ROUTINE_PATH, ROUTINE_SIGNUP_PATH, routineHighlights, windowText, type RoutineMembership } from '@/lib/routine';

/**
 * The dashboard's Routine card (client review 2026-10-20, #12): a member sees their schedule and
 * the next pickup with a link to manage it; everyone else sees what the Routine is and how to start.
 */
interface RoutineView {
  membership: RoutineMembership | null;
  upcomingPickup?: string | null;
}

export function RoutineCard({ className }: { className?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['routine-membership'],
    queryFn: async (): Promise<RoutineView> => {
      const res = await fetch('/api/routine');
      if (!res.ok) return { membership: null };
      return res.json();
    },
    staleTime: 60 * 1000,
  });
  if (isLoading) return null;

  const m = data?.membership;
  const heading = (
    <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-navy)', margin: '0 0 var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <Repeat size={18} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--color-gold-text)' }} />
      {m ? `Your ${CADENCE_LABEL[m.cadence]} Routine` : 'First Eleven Routine'}
    </h2>
  );
  const text = { fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-3)' } as const;

  if (m) {
    const upcoming = data?.upcomingPickup ?? m.next_pickup_date;
    return (
      <Card variant="bordered" padding="lg" className={className}>
        {heading}
        <p style={text}>
          {m.pickup_day}s, {windowText(m.pickup_window)}.{' '}
          {m.status === 'paused'
            ? `Paused${m.paused_until ? ` until ${formatLongDate(m.paused_until)}` : ''}.`
            : upcoming
              ? `Next pickup: ${formatLongDate(upcoming)}.`
              : ''}
        </p>
        <ButtonLink href={ROUTINE_PATH} variant="outline" size="sm">
          Skip, pause or change your Routine
        </ButtonLink>
      </Card>
    );
  }

  return (
    <Card variant="bordered" padding="lg" className={className}>
      {heading}
      <p style={text}>Standing pickups on your day and in your window, every week or every other week.</p>
      <ul style={{ ...text, paddingLeft: 'var(--space-5)' }}>
        {routineHighlights().map((h) => (
          <li key={h.key}>
            <strong style={{ color: 'var(--color-navy)' }}>{h.title}.</strong> {h.text}
          </li>
        ))}
      </ul>
      <ButtonLink href={ROUTINE_SIGNUP_PATH} variant="primary" size="sm">
        Start Your Routine
      </ButtonLink>
    </Card>
  );
}
