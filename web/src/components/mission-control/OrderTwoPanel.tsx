'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '@/components/ui';

/**
 * The Growth panel (client 2026-10-14): "a customer who completes 2 orders in their first 21
 * days." Each week's new customers (first pickup that week), how many reached order two, and
 * how many are still inside their 21 days (left out of the rate until they're done).
 */
interface RateLine {
  label: string;
  customers: number;
  reached: number;
  open: number;
  rate: number | null;
}
interface WeekLine extends RateLine {
  week: string;
  weekEnd: string;
}
interface Report {
  weeks: number;
  from: string;
  to: string;
  windowDays: number;
  total: RateLine;
  byWeek: WeekLine[];
  byTerritory: RateLine[];
  byRepCode: RateLine[];
  messages: { key: string; label: string; A: RateLine; B: RateLine }[];
}

const cell = { padding: '6px 8px', borderTop: '1px solid #1e293b', fontSize: '13px', color: '#e2e8f0', textAlign: 'left' } as const;
const head = { ...cell, borderTop: 'none', color: '#94a3b8', fontWeight: 600 } as const;
const small = { fontSize: '12px', color: '#94a3b8', margin: 0 } as const;
const title = { fontSize: '15px', fontWeight: 800, color: '#ffffff', margin: '0 0 4px' } as const;
const card = { background: '#0d1527', borderColor: '#1e293b' } as const;
const day = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const rate = (r: RateLine) => (r.rate === null ? '—' : `${r.rate}%`);

function RateTable({ first, lines, empty }: { first: string; lines: { key: string; name: React.ReactNode; line: RateLine }[]; empty: string }) {
  if (lines.length === 0) return <p style={{ color: '#cbd5e1', margin: 0 }}>{empty}</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {[first, 'New customers', 'Reached order two', 'Still open', 'Rate'].map((h) => (
            <th key={h} style={head}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lines.map(({ key, name, line }) => (
          <tr key={key}>
            <td style={cell}>{name}</td>
            <td style={cell}>{line.customers}</td>
            <td style={cell}>{line.reached}</td>
            <td style={cell}>{line.open}</td>
            <td style={{ ...cell, fontWeight: 700 }}>{rate(line)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function OrderTwoPanel() {
  const [weeks, setWeeks] = useState(8);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['order-two-rate', weeks],
    queryFn: async (): Promise<Report> => {
      const res = await fetch(`/api/mission-control/order-two-rate?weeks=${weeks}`);
      if (!res.ok) throw new Error('Could not load the Growth panel');
      return res.json();
    },
  });

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <Card variant="bordered" padding="lg" style={card}>
        <h3 style={{ ...title, fontSize: '16px' }}>📈 Order two in 21 days</h3>
        <p style={small}>
          A new customer reached order two when a second order (not cancelled) is picked up within 21 days of their first pickup. Customers still inside their 21 days are &quot;still open&quot;
          and left out of the rate until their time is up.
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
          <span style={{ color: '#cbd5e1', fontSize: '13px' }}>Show the last</span>
          {[4, 8, 12].map((n) => (
            <Button key={n} variant={n === weeks ? 'outlineGold' : 'outlineLight'} size="sm" onClick={() => setWeeks(n)} aria-pressed={n === weeks}>
              {n} weeks
            </Button>
          ))}
          {data && (
            <strong style={{ color: '#ffffff', marginLeft: 'auto' }}>
              {day(data.from)} to {day(data.to)}: {rate(data.total)} ({data.total.reached} of {data.total.customers - data.total.open} done)
            </strong>
          )}
        </div>
      </Card>

      {isError ? (
        <p style={{ color: '#fca5a5' }}>Could not load the Growth panel.</p>
      ) : isLoading || !data ? (
        <p style={{ color: '#cbd5e1' }}>Loading…</p>
      ) : (
        <>
          <Card variant="bordered" padding="lg" style={card}>
            <h4 style={title}>By week (first pickup, Monday to Sunday)</h4>
            <RateTable
              first="Week"
              empty="No new customers yet."
              lines={data.byWeek.map((w) => ({ key: w.week, name: `${day(w.week)} to ${day(w.weekEnd)}${w.open ? ' (still open)' : ''}`, line: w }))}
            />
          </Card>
          <Card variant="bordered" padding="lg" style={card}>
            <h4 style={title}>By territory (first order&apos;s address)</h4>
            <RateTable first="Territory" empty="No new customers in this range." lines={data.byTerritory.map((l) => ({ key: l.label, name: l.label, line: l }))} />
          </Card>
          <Card variant="bordered" padding="lg" style={card}>
            <h4 style={title}>By rep code</h4>
            <RateTable first="Rep code" empty="No new customers in this range." lines={data.byRepCode.map((l) => ({ key: l.label, name: l.label, line: l }))} />
          </Card>
          <Card variant="bordered" padding="lg" style={card}>
            <h4 style={title}>Message tests: version A against B</h4>
            <p style={{ ...small, marginBottom: '8px' }}>
              Every customer who got the message since its count started (any week), by the version they got, and the share who reached order two. The Message Tests tab shows
              taps and bookings within 7 days.
            </p>
            {data.messages.length === 0 ? (
              <p style={{ color: '#cbd5e1', margin: 0 }}>No tested messages sent yet.</p>
            ) : (
              <RateTable
                first="Message"
                empty=""
                lines={data.messages.flatMap((m) => [
                  { key: `${m.key}-A`, name: `${m.label}: version A`, line: m.A },
                  { key: `${m.key}-B`, name: `${m.label}: version B`, line: m.B },
                ])}
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
