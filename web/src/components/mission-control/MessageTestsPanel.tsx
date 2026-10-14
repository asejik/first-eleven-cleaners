'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';

/**
 * Message Tests (client 2026-10-14): "run two versions of any message (A/B) and see sends,
 * taps, and bookings for each." Each customer always gets the same version (50/50 while B is
 * on). A booking counts for a version when that customer books within 7 days of it. Changing
 * a text starts a fresh count.
 */
interface Stats {
  sent: number;
  tapped: number;
  booked: number;
}
interface TestedMessage {
  key: string;
  label: string;
  when: string;
  placeholders: string[];
  zone5?: boolean;
  a: string;
  b: string;
  bOn: boolean;
  countFrom: string | null;
  stats: { A: Stats; B: Stats };
}

const cell = { padding: '6px 8px', borderTop: '1px solid #1e293b', fontSize: '13px', color: '#e2e8f0', textAlign: 'left' } as const;
const area = { width: '100%', minHeight: '70px', background: '#0b1220', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', padding: '8px', fontSize: '13px', fontFamily: 'inherit' } as const;
const small = { fontSize: '12px', color: '#94a3b8', margin: 0 } as const;
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');

function MessageCard({ m, onSaved }: { m: TestedMessage; onSaved: () => Promise<void> }) {
  const addToast = useUIStore((s) => s.addToast);
  const [a, setA] = useState(m.a);
  const [b, setB] = useState(m.b);
  const [bOn, setBOn] = useState(m.bOn);
  const [busy, setBusy] = useState(false);
  const dirty = (!m.zone5 && a !== m.a) || b !== m.b || bOn !== m.bOn;

  const post = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/mission-control/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Not saved');
      addToast({ type: 'success', title: done });
      await onSaved();
    } catch (err) {
      addToast({ type: 'error', title: 'Not saved', message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="bordered" padding="lg" style={{ background: '#0d1527', borderColor: '#1e293b' }}>
      <div style={{ display: 'grid', gap: '10px' }}>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', margin: 0 }}>{m.label}</h3>
          <p style={small}>
            {m.when} Placeholders: {m.placeholders.map((p) => `[${p}]`).join(' ')}
          </p>
        </div>
        <label style={{ display: 'grid', gap: '4px', color: '#cbd5e1', fontSize: '13px' }}>
          Version A
          {m.zone5 ? (
            <>
              <p style={{ ...area, minHeight: 0, margin: 0 }}>{m.a}</p>
              <span style={small}>Edit version A in Zones &gt; Zone 5 messages.</span>
            </>
          ) : (
            <textarea aria-label={`${m.label} version A`} value={a} onChange={(e) => setA(e.target.value)} maxLength={480} style={area} />
          )}
        </label>
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#cbd5e1', fontSize: '13px' }}>
          <input type="checkbox" checked={bOn} onChange={(e) => setBOn(e.target.checked)} />
          Test a version B (half the customers get it)
        </label>
        {(bOn || b) && (
          <textarea aria-label={`${m.label} version B`} value={b} onChange={(e) => setB(e.target.value)} maxLength={480} placeholder="Version B" style={area} />
        )}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {dirty && (
            <Button variant="outlineGold" size="sm" disabled={busy} onClick={() => post({ action: 'save', key: m.key, ...(m.zone5 ? {} : { a }), b, bOn }, 'Saved; the count starts fresh')}>
              Save
            </Button>
          )}
          <Button variant="outlineLight" size="sm" disabled={busy} onClick={() => window.confirm('Start a fresh count for this message?') && post({ action: 'restart', key: m.key }, 'Fresh count started')}>
            Start a fresh count
          </Button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Version', 'Sent', 'Tapped', 'Booked within 7 days'].map((h) => (
                <th key={h} style={{ ...cell, borderTop: 'none', color: '#94a3b8', fontWeight: 600 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(['A', 'B'] as const).map((v) => (
              <tr key={v}>
                <td style={cell}>{v}</td>
                <td style={cell}>{m.stats[v].sent}</td>
                <td style={cell}>
                  {m.stats[v].tapped} ({pct(m.stats[v].tapped, m.stats[v].sent)})
                </td>
                <td style={cell}>
                  {m.stats[v].booked} ({pct(m.stats[v].booked, m.stats[v].sent)})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={small}>
          {m.countFrom ? `Counting since ${new Date(m.countFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.` : 'Counting since the start.'} Taps include
          phones that open links to show a preview.
        </p>
      </div>
    </Card>
  );
}

export function MessageTestsPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['message-tests'],
    queryFn: async (): Promise<{ messages: TestedMessage[] }> => {
      const res = await fetch('/api/mission-control/messages');
      if (!res.ok) throw new Error('Could not load the message tests');
      return res.json();
    },
  });
  if (isLoading || !data) return <p style={{ color: '#cbd5e1' }}>Loading…</p>;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['message-tests'] });
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <p style={{ ...small, fontSize: '13px' }}>
        Write a version B to test it against A: each customer always gets the same version, half A and half B. A booking counts for a version when that customer books within 7 days of it.
      </p>
      {data.messages.map((m) => (
        <MessageCard key={`${m.key}:${m.countFrom}:${m.a}:${m.b}:${m.bOn}`} m={m} onSaved={refresh} />
      ))}
    </div>
  );
}
