'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';

/**
 * Field reps (client 2026-10-14): the owner's list of rep codes, TERRITORY-WAVE-REP (e.g.
 * 1D-W1-JM). Add a rep, switch one off (or back on). Customers enter the code at signup or
 * booking, or a rep's card links /book?rep=CODE. The payout report comes later.
 */
interface Rep {
  code: string;
  territory_id: string;
  rep_name: string;
  active: boolean;
  customers: number;
}

const cell = { padding: '6px 8px', borderTop: '1px solid #1e293b', fontSize: '13px', color: '#e2e8f0', textAlign: 'left' } as const;
const input = { background: '#0b1220', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', padding: '6px 8px', fontSize: '13px' } as const;

export function RepsPanel() {
  const addToast = useUIStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['reps'],
    queryFn: async (): Promise<{ reps: Rep[] }> => {
      const res = await fetch('/api/mission-control/reps');
      if (!res.ok) throw new Error('Could not load reps');
      return res.json();
    },
  });
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const post = async (body: Record<string, unknown>, key: string, done: string) => {
    setBusy(key);
    try {
      const res = await fetch('/api/mission-control/reps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Not saved');
      addToast({ type: 'success', title: done });
      await queryClient.invalidateQueries({ queryKey: ['reps'] });
      return true;
    } catch (err) {
      addToast({ type: 'error', title: 'Not saved', message: (err as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const reps = data?.reps || [];
  return (
    <Card variant="bordered" padding="lg" style={{ background: '#0d1527', borderColor: '#1e293b' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: '0 0 4px' }}>🪪 Field reps</h3>
      <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px' }}>
        Codes are TERRITORY-WAVE-REP, for example 1D-W1-JM. Customers enter one at signup or booking, or a rep&apos;s card links to /book?rep=CODE. A customer keeps the first code they used.
      </p>
      <form
        style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (await post({ action: 'add', code, rep_name: name }, 'add', `${code.toUpperCase()} added`)) {
            setCode('');
            setName('');
          }
        }}
      >
        <input aria-label="Rep code" placeholder="1D-W1-JM" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} style={{ ...input, width: '130px' }} />
        <input aria-label="Rep name" placeholder="Rep's name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} style={{ ...input, flex: 1, minWidth: '140px' }} />
        <Button type="submit" variant="outlineGold" size="sm" disabled={busy === 'add' || !code.trim() || name.trim().length < 2}>
          Add rep
        </Button>
      </form>
      {isLoading ? (
        <p style={{ color: '#cbd5e1' }}>Loading…</p>
      ) : reps.length === 0 ? (
        <p style={{ color: '#cbd5e1', margin: 0 }}>No reps yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {reps.map((r) => (
              <tr key={r.code} style={{ opacity: r.active ? 1 : 0.55 }}>
                <td style={cell}>
                  <strong>{r.code}</strong>
                </td>
                <td style={cell}>{r.rep_name}</td>
                <td style={cell}>{r.customers} customer{r.customers === 1 ? '' : 's'}</td>
                <td style={cell}>
                  <Button
                    variant="outlineLight"
                    size="sm"
                    disabled={busy === r.code}
                    onClick={() => post({ action: 'set_active', code: r.code, active: !r.active }, r.code, r.active ? `${r.code} switched off` : `${r.code} switched on`)}
                  >
                    {r.active ? 'Switch off' : 'Switch on'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
