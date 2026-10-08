'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui';
import { formatLongDate } from '@/lib/coverage';
import { CADENCE_LABEL, windowText, type RoutineCadence } from '@/lib/routine';

/**
 * Routine members (client 2026-10-08): status, plan, day and window, next pickup and skips in
 * a row, newest first.
 */
type One<T> = T | T[] | null;
interface MemberRow {
  id: string;
  status: 'active' | 'paused' | 'cancelled';
  cadence: RoutineCadence;
  pickup_day: string;
  pickup_window: string;
  next_pickup_date: string | null;
  paused_until: string | null;
  consecutive_skips: number;
  created_at: string;
  customer: One<{ full_name: string; email: string; phone: string | null }>;
  address: One<{ city: string; zip: string }>;
}
const first = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

const cell = { padding: '8px 10px', borderBottom: '1px solid #1e293b', fontSize: '13px', color: '#e2e8f0', textAlign: 'left' } as const;
const head = { ...cell, color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' } as const;
const STATUS_COLOR = { active: '#34d399', paused: '#fde68a', cancelled: '#94a3b8' } as const;

export function RoutineMembersPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['routine-members'],
    queryFn: async (): Promise<{ members: MemberRow[] }> => {
      const res = await fetch('/api/mission-control/routine');
      if (!res.ok) throw new Error('Could not load Routine members');
      return res.json();
    },
    refetchInterval: 60_000,
  });
  const members = data?.members || [];
  const open = members.filter((m) => m.status !== 'cancelled');

  return (
    <Card variant="bordered" padding="lg" style={{ background: '#0d1527', borderColor: '#1e293b' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: '0 0 4px' }}>🔄 Routine members</h3>
      <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px' }}>
        {open.filter((m) => m.status === 'active').length} active, {open.filter((m) => m.status === 'paused').length} paused. Three skips in a row pause a membership.
      </p>
      {isLoading ? (
        <p style={{ color: '#cbd5e1' }}>Loading…</p>
      ) : members.length === 0 ? (
        <p style={{ color: '#cbd5e1' }}>No Routine members yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={head}>Member</th>
                <th style={head}>Plan</th>
                <th style={head}>Pickup</th>
                <th style={head}>Next</th>
                <th style={head}>Skips</th>
                <th style={head}>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const c = first(m.customer);
                const a = first(m.address);
                return (
                  <tr key={m.id}>
                    <td style={cell}>
                      {c?.full_name || '—'}
                      <div style={{ color: '#94a3b8', fontSize: '12px' }}>{[c?.phone, c?.email].filter(Boolean).join(' · ')}{a ? ` · ${a.city} ${a.zip}` : ''}</div>
                    </td>
                    <td style={cell}>{CADENCE_LABEL[m.cadence]}</td>
                    <td style={cell}>{m.pickup_day}s, {windowText(m.pickup_window)}</td>
                    <td style={cell}>
                      {m.status === 'active' && m.next_pickup_date
                        ? formatLongDate(m.next_pickup_date)
                        : m.status === 'paused' && m.paused_until
                          ? `Paused until ${formatLongDate(m.paused_until)}`
                          : '—'}
                    </td>
                    <td style={cell}>{m.consecutive_skips}</td>
                    <td style={{ ...cell, color: STATUS_COLOR[m.status], fontWeight: 700, textTransform: 'capitalize' }}>{m.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
