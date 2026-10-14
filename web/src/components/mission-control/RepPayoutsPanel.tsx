'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';

/**
 * Weekly payouts (client 2026-10-14): per rep code, Monday to Sunday, ready Monday morning.
 * Verified first orders are counted when the card is charged; one fully refunded in the same
 * week drops off. Field reps: per order plus the Starting XI bonus; drivers: per conversion.
 */
interface Rates {
  fieldPerOrder: number;
  startingXiBonus: number;
  driverPerOrder: number;
}
interface Row {
  code: string;
  repName: string;
  kind: 'field' | 'driver';
  signups: number;
  verified: number;
  startingXi: number[];
  cardConversions: number;
  amount: number;
}
interface Report {
  week: string;
  weekEnd: string;
  rates: Rates;
  rows: Row[];
  total: number;
}

const cell = { padding: '6px 8px', borderTop: '1px solid #1e293b', fontSize: '13px', color: '#e2e8f0', textAlign: 'left' } as const;
const input = { width: '64px', background: '#0b1220', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', padding: '4px 6px' } as const;
const small = { fontSize: '12px', color: '#94a3b8', margin: 0 } as const;
const money = (n: number) => `$${n.toFixed(2)}`;
const label = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function RepPayoutsPanel() {
  const addToast = useUIStore((s) => s.addToast);
  const queryClient = useQueryClient();
  // Blank: the week just ended (on a Monday morning, last week)
  const [week, setWeek] = useState<string>('');
  const { data, isLoading } = useQuery({
    queryKey: ['rep-payouts', week],
    queryFn: async (): Promise<Report> => {
      const res = await fetch(`/api/mission-control/rep-payouts${week ? `?week=${week}` : ''}`);
      if (!res.ok) throw new Error('Could not load the payout report');
      return res.json();
    },
  });
  const [rates, setRates] = useState<Rates | null>(null);
  const [busy, setBusy] = useState(false);
  const shownRates = rates ?? data?.rates ?? null;

  const saveRates = async () => {
    if (!rates) return;
    setBusy(true);
    try {
      const res = await fetch('/api/mission-control/rep-payouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rates) });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Not saved');
      addToast({ type: 'success', title: 'Rates saved' });
      setRates(null);
      await queryClient.invalidateQueries({ queryKey: ['rep-payouts'] });
    } catch (err) {
      addToast({ type: 'error', title: 'Not saved', message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const rateInput = (key: keyof Rates, aria: string) =>
    shownRates && (
      <input
        aria-label={aria}
        type="number"
        min={0}
        step="0.5"
        value={shownRates[key]}
        onChange={(e) => setRates({ ...shownRates, [key]: Number(e.target.value) })}
        style={input}
      />
    );

  return (
    <Card variant="bordered" padding="lg" style={{ background: '#0d1527', borderColor: '#1e293b' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: '0 0 4px' }}>💵 Weekly payouts</h3>
      {isLoading || !data ? (
        <p style={{ color: '#cbd5e1' }}>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="outlineLight" size="sm" onClick={() => setWeek(shift(data.week, -7))} aria-label="Previous week">
              ←
            </Button>
            <strong style={{ color: '#ffffff' }}>
              Mon {label(data.week)} to Sun {label(data.weekEnd)}
            </strong>
            <Button variant="outlineLight" size="sm" onClick={() => setWeek(shift(data.week, 7))} aria-label="Next week">
              →
            </Button>
            <a href={`/api/mission-control/rep-payouts?week=${data.week}&format=csv`} style={{ color: '#fde68a', fontSize: '13px', marginLeft: 'auto' }}>
              Download spreadsheet (CSV)
            </a>
          </div>
          {data.rows.length === 0 ? (
            <p style={{ color: '#cbd5e1', margin: 0 }}>Nothing to pay for this week.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Rep code', 'Type', 'Signups', 'Verified first orders', 'Starting XI', 'Card conversions', 'Payout'].map((h) => (
                    <th key={h} style={{ ...cell, borderTop: 'none', color: '#94a3b8', fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.code}>
                    <td style={cell}>
                      <strong>{r.code}</strong> <span style={{ color: '#94a3b8' }}>{r.repName}</span>
                    </td>
                    <td style={cell}>{r.kind === 'driver' ? 'Driver' : 'Field rep'}</td>
                    <td style={cell}>{r.signups}</td>
                    <td style={cell}>{r.kind === 'field' ? r.verified : '—'}</td>
                    <td style={cell}>{r.startingXi.length ? r.startingXi.map((n) => `#${n}`).join(' ') : r.kind === 'field' ? '0' : '—'}</td>
                    <td style={cell}>{r.kind === 'driver' ? r.cardConversions : '—'}</td>
                    <td style={cell}>{money(r.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...cell, fontWeight: 700 }} colSpan={6}>
                    Total
                  </td>
                  <td style={{ ...cell, fontWeight: 700 }}>{money(data.total)}</td>
                </tr>
              </tbody>
            </table>
          )}
          <p style={{ ...small, display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            Field rep: $ {rateInput('fieldPerOrder', 'Field rep per verified first order')} per verified first order, plus ${' '}
            {rateInput('startingXiBonus', 'Starting XI bonus')} for each Starting XI order. Driver: $ {rateInput('driverPerOrder', 'Driver per conversion')} per conversion.
            {rates && (
              <Button variant="outlineGold" size="sm" disabled={busy} onClick={saveRates}>
                Save rates
              </Button>
            )}
          </p>
          <p style={small}>
            Verified means the card was charged, not just booked. An order fully refunded in the same week drops off. Starting XI is the first 11 verified first orders on a field rep&apos;s code in each territory.
          </p>
        </div>
      )}
    </Card>
  );
}
