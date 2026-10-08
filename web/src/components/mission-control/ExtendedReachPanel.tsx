'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button } from '@/components/ui';
import { formatLongDate } from '@/lib/coverage';
import { useUIStore } from '@/stores/ui-store';
import type { RunSummary } from '@/lib/extended-reach';
import { Zone5MessagesEditor } from './Zone5MessagesEditor';

/**
 * Zone 5 panel (client 2026-10-07, 8D): each upcoming run's bookings against its threshold,
 * with "dispatch anyway" to run it below the threshold, and the waitlist.
 */
interface WaitlistEntry {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  zip: string;
  miles: number | null;
  reason?: string;
  sms_consent?: boolean;
  notified_at?: string | null;
  created_at: string;
}

export interface ResolutionLogRow {
  zip: string;
  miles: number | null;
  zone_id: string;
  band: string | null;
  last_seen_at: string;
}

const cell = { padding: '8px 10px', borderBottom: '1px solid #1e293b', fontSize: '13px', color: '#e2e8f0', textAlign: 'left' } as const;
const head = { ...cell, color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' } as const;

export function ExtendedReachPanel() {
  const addToast = useUIStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['zone5'],
    queryFn: async (): Promise<{ runs: RunSummary[]; waitlist: WaitlistEntry[]; resolutionLog: ResolutionLogRow[] }> => {
      const res = await fetch('/api/mission-control/zone5');
      if (!res.ok) throw new Error('Could not load Zone 5');
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const dispatchAnyway = async (run: RunSummary) => {
    const key = `${run.runDate}/${run.band}`;
    if (!window.confirm(`Run the Band ${run.band} route on ${formatLongDate(run.runDate)} with ${run.booked} of ${run.threshold} bookings? Its customers get "route confirmed" with the Monday evening check.`)) return;
    setBusy(key);
    try {
      const res = await fetch('/api/mission-control/zone5', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_date: run.runDate, band: run.band }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not dispatch');
      addToast({
        type: 'success',
        title: 'Route dispatched',
        message: body.notified ? `${body.notified} customer(s) told the date.` : 'Its customers get "route confirmed" with the Monday evening check.',
      });
      await queryClient.invalidateQueries({ queryKey: ['zone5'] });
    } catch (err) {
      addToast({ type: 'error', title: 'Not dispatched', message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
      <Card variant="bordered" padding="lg" style={{ background: '#0d1527', borderColor: '#1e293b' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: '0 0 4px' }}>🚐 Zone 5 runs</h3>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px' }}>
          Runs always go out when deliveries are due. New pickups are accepted once a band reaches its threshold or a delivery is due that day. Monday evening (two days before), runs going out get &quot;route confirmed&quot; and pickups on a run that has neither move to the next run and get &quot;route not reached&quot;.
        </p>
        {isLoading ? (
          <p style={{ color: '#cbd5e1' }}>Loading…</p>
        ) : !data?.runs.length ? (
          <p style={{ color: '#cbd5e1' }}>No runs to show (database not connected).</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={head}>Run</th>
                  <th style={head}>Band</th>
                  <th style={head}>Pickups</th>
                  <th style={head}>Deliveries due</th>
                  <th style={head}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((run) => {
                  const key = `${run.runDate}/${run.band}`;
                  return (
                    <tr key={key}>
                      <td style={cell}>{formatLongDate(run.runDate)}</td>
                      <td style={cell}>{run.band}</td>
                      <td style={cell}>{run.booked} of {run.threshold}</td>
                      <td style={cell}>{run.deliveriesDue}</td>
                      <td style={cell}>
                        {run.dispatched ? (
                          <span style={{ color: '#34d399', fontWeight: 700 }}>Dispatched{run.notified ? ' · customers told' : ''}</span>
                        ) : run.booked > 0 ? (
                          <Button variant="outlineGold" size="sm" onClick={() => dispatchAnyway(run)} disabled={busy === key}>
                            {busy === key ? 'Dispatching…' : 'Dispatch anyway'}
                          </Button>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Open</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card variant="bordered" padding="lg" style={{ background: '#0d1527', borderColor: '#1e293b' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: '0 0 4px' }}>📋 Waitlist</h3>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px' }}>Addresses beyond our routes, newest first.</p>
        {!data?.waitlist.length ? (
          <p style={{ color: '#cbd5e1' }}>Nobody on the waitlist yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={head}>Name</th>
                  <th style={head}>Contact</th>
                  <th style={head}>Area</th>
                  <th style={head}>Miles</th>
                </tr>
              </thead>
              <tbody>
                {data.waitlist.map((w) => (
                  <tr key={w.id}>
                    <td style={cell}>{w.full_name || '—'}</td>
                    <td style={cell}>
                      {[w.email, w.phone].filter(Boolean).join(' · ')}
                      {w.phone && !w.sms_consent && <span style={{ color: '#94a3b8' }}> · email only</span>}
                    </td>
                    <td style={cell}>
                      {[w.city, w.zip].filter(Boolean).join(' ')}
                      {w.reason === 'zone5_not_started' &&
                        (w.notified_at ? (
                          <span style={{ color: '#34d399' }}> · Zone 5, told it opened {new Date(w.notified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        ) : (
                          <span style={{ color: '#fde68a' }}> · Zone 5, waiting for first run</span>
                        ))}
                    </td>
                    <td style={cell}>{w.miles != null ? Number(w.miles).toFixed(0) : '?'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Zone5MessagesEditor />
    </div>
  );
}
