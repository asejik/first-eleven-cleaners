'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import type { TierFlag } from '@/lib/tier-down';
import type { TierDownSettings } from '@/lib/coverage';

/**
 * Tier-down (client 2026-10-10): busy ZIPs flagged for their next step down (one at a time,
 * with approval), Zone 5 ZIPs flagged "Promote to Zone 4?", and stepped-down ZIPs that have
 * gone quiet (review only; nothing is raised automatically). The thresholds are editable.
 */
interface TierView {
  flags: TierFlag[];
  tierDown: TierDownSettings;
  zipMinimums: Record<string, number>;
  history: Array<{ zip: string; action: string; from_minimum: number | null; to_minimum: number | null; orders_counted: number | null; approved_by: string | null; approved_at: string }>;
}

const cell = { padding: '6px 8px', borderTop: '1px solid #1e293b', fontSize: '13px', color: '#e2e8f0', textAlign: 'left' } as const;
const numberInput = { width: '56px', background: '#0b1220', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', padding: '4px 6px' } as const;
const zoneLabel = (id: string) => id.replace('zone_', 'Zone ');

export function TierDownPanel() {
  const addToast = useUIStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['tier-down'],
    queryFn: async (): Promise<TierView> => {
      const res = await fetch('/api/mission-control/tier-down');
      if (!res.ok) throw new Error('Could not load tier-down flags');
      return res.json();
    },
  });
  const [edits, setEdits] = useState<TierDownSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const settings = edits ?? data?.tierDown ?? null;

  const post = async (body: Record<string, unknown>, key: string, done: (r: { told?: number }) => string) => {
    setBusy(key);
    try {
      const res = await fetch('/api/mission-control/tier-down', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Not saved');
      addToast({ type: 'success', title: done(result) });
      setEdits(null);
      await queryClient.invalidateQueries({ queryKey: ['tier-down'] });
    } catch (err) {
      addToast({ type: 'error', title: 'Not done', message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const approve = (f: TierFlag) => {
    const question =
      f.kind === 'tier_down'
        ? `Lower ${f.zip}'s minimum from $${f.current} to $${f.next}? Everyone with an address there gets the "your neighborhood just unlocked" message.`
        : `Promote ${f.zip} to Zone 4? Its pickups move to the Zone 4 route days and the Extended Reach fee goes away. Everyone with an address there is told.`;
    if (window.confirm(question)) void post({ action: 'approve', zip: f.zip, kind: f.kind }, `${f.kind}:${f.zip}`, (r) => `Approved; ${r.told ?? 0} customer(s) told`);
  };

  const actionable = (data?.flags || []).filter((f) => f.kind !== 'review');
  const reviews = (data?.flags || []).filter((f) => f.kind === 'review');

  return (
    <Card variant="bordered" padding="lg" style={{ background: '#0d1527', borderColor: '#1e293b' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: '0 0 4px' }}>📉 Tier-down flags</h3>
      {isLoading || !data || !settings ? (
        <p style={{ color: '#cbd5e1' }}>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            Flag a ZIP at
            <input aria-label="Orders to flag" type="number" min={1} value={settings.flagOrders} onChange={(e) => setEdits({ ...settings, flagOrders: Number(e.target.value) })} style={numberInput} />
            orders in
            <input aria-label="Weeks to flag" type="number" min={1} value={settings.flagWeeks} onChange={(e) => setEdits({ ...settings, flagWeeks: Number(e.target.value) })} style={numberInput} />
            weeks; review a stepped-down ZIP under
            <input aria-label="Orders to review" type="number" min={1} value={settings.reviewOrders} onChange={(e) => setEdits({ ...settings, reviewOrders: Number(e.target.value) })} style={numberInput} />
            orders in
            <input aria-label="Weeks to review" type="number" min={1} value={settings.reviewWeeks} onChange={(e) => setEdits({ ...settings, reviewWeeks: Number(e.target.value) })} style={numberInput} />
            weeks.
            {edits && (
              <Button variant="outlineGold" size="sm" disabled={busy === 'settings'} onClick={() => post({ action: 'settings', tierDown: edits }, 'settings', () => 'Thresholds saved')}>
                Save
              </Button>
            )}
          </p>

          {actionable.length === 0 ? (
            <p style={{ color: '#cbd5e1', margin: 0 }}>No ZIP is ready for a step down yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {actionable.map((f) => (
                  <tr key={`${f.kind}:${f.zip}`}>
                    <td style={cell}>
                      <strong>{f.zip}</strong> · {zoneLabel(f.zoneId)}
                    </td>
                    <td style={cell}>{f.orders} orders since {f.since}</td>
                    <td style={cell}>
                      <Button variant="outlineGold" size="sm" disabled={busy === `${f.kind}:${f.zip}`} onClick={() => approve(f)}>
                        {f.kind === 'tier_down' ? `Approve $${f.current} → $${f.next}` : 'Promote to Zone 4?'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reviews.length > 0 && (
            <div>
              <p style={{ fontSize: '12px', color: '#fde68a', margin: '0 0 4px' }}>For review (nothing changes on its own):</p>
              {reviews.map((f) => (
                <p key={`review:${f.zip}`} style={{ fontSize: '13px', color: '#e2e8f0', margin: 0 }}>
                  {f.zip} at ${f.current}: {f.orders} orders since {f.since}
                </p>
              ))}
            </div>
          )}

          {data.history.length > 0 && (
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
              Recent:{' '}
              {data.history
                .slice(0, 8)
                .map((h) => `${h.zip} ${h.action === 'tier_down' ? `$${h.from_minimum} → $${h.to_minimum}` : 'to Zone 4'} (${new Date(h.approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`)
                .join(' · ')}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
