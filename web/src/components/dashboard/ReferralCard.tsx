'use client';

import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';

/**
 * Give $15 / Get $15 (client 2026-10-10): the customer's code and link, their account credit,
 * and how many friends have joined.
 */
interface ReferralView {
  code: string | null;
  link: string | null;
  credit: number;
  amount: number;
  rewarded: number;
  pending: number;
}

export function ReferralCard({ className }: { className?: string }) {
  const addToast = useUIStore((s) => s.addToast);
  const { data } = useQuery({
    queryKey: ['referral'],
    queryFn: async (): Promise<ReferralView> => {
      const res = await fetch('/api/referral');
      if (!res.ok) throw new Error('Could not load your referral code');
      return res.json();
    },
  });
  if (!data?.code || !data.link) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.link!);
      addToast({ type: 'success', title: 'Link copied', message: 'Send it to a friend.' });
    } catch {
      addToast({ type: 'info', title: 'Your link', message: data.link! });
    }
  };

  return (
    <Card variant="bordered" padding="lg" className={className}>
      <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-navy)', margin: '0 0 var(--space-2)' }}>
        🎁 Give ${data.amount}, Get ${data.amount}
      </h2>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-3)' }}>
        Friends get ${data.amount} off their first order with your code. You get ${data.amount} of credit when their order is delivered.
      </p>
      <p style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-sm)' }}>
        Your code: <strong style={{ letterSpacing: '0.06em' }}>{data.code}</strong>
      </p>
      <p style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-sm)', wordBreak: 'break-all' }}>
        Your link: <span>{data.link}</span>
      </p>
      <Button variant="outline" size="sm" onClick={copy}>
        Copy my link
      </Button>
      <p style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-navy)' }}>
        Account credit: <strong>${data.credit.toFixed(2)}</strong>
        {data.credit > 0 ? ' (comes off your next order automatically)' : ''}
        {data.rewarded + data.pending > 0 ? ` · ${data.rewarded} friend${data.rewarded === 1 ? '' : 's'} joined${data.pending ? `, ${data.pending} on the way` : ''}` : ''}
      </p>
    </Card>
  );
}
