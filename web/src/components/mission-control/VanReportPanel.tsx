'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '@/components/ui';
import type { VanReport } from '@/lib/van-report';

/**
 * The van report, VAN-01 (client 2026-10-23): "Someone sees the van, scans or texts, books a
 * pickup, and we can measure the resulting customer and revenue." Each step counts people once.
 */
const cell = { padding: '6px 8px', borderTop: '1px solid #1e293b', fontSize: '13px', color: '#e2e8f0', textAlign: 'left' } as const;
const head = { ...cell, borderTop: 'none', color: '#94a3b8', fontWeight: 600 } as const;
const small = { fontSize: '12px', color: '#94a3b8', margin: 0 } as const;
const title = { fontSize: '15px', fontWeight: 800, color: '#ffffff', margin: '0 0 4px' } as const;
const card = { background: '#0d1527', borderColor: '#1e293b' } as const;
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 0, label: 'Since the start' },
];

export function VanReportPanel() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['van-report', days],
    queryFn: async (): Promise<VanReport> => {
      const res = await fetch(`/api/mission-control/van-report?days=${days}`);
      if (!res.ok) throw new Error('Could not load the van report');
      return res.json();
    },
  });

  const rows: [string, string | number, string][] = data
    ? [
        ['Visited the van page', data.visitors, `${data.pageViews} page views in all`],
        ['  came by the QR code', data.visitorsByChannel.qr, ''],
        ['  came by the PICKUP text link', data.visitorsByChannel.text, ''],
        ['  typed the address', data.visitorsByChannel.typed, ''],
        ['Texted PICKUP', data.pickupTexters, `${data.pickupTexts} texts in all`],
        ['Tapped "Schedule Your Pickup"', data.scheduleTaps, 'went on to the booking form'],
        [
          'Completed a booking',
          data.bookings,
          `QR ${data.bookingsByChannel.qr}, text ${data.bookingsByChannel.text}, typed ${data.bookingsByChannel.typed}${data.cancelledBookings ? `; ${data.cancelledBookings} cancelled, not counted` : ''}`,
        ],
        [
          'New customers',
          data.newCustomers,
          `first order from the van (QR ${data.newCustomersByChannel.qr}, text ${data.newCustomersByChannel.text}, typed ${data.newCustomersByChannel.typed})`,
        ],
        ['Paying customers', data.payingCustomers, 'new customers whose card has been charged'],
        ['Revenue', usd(data.revenue), 'everything those customers have paid, less refunds'],
      ]
    : [];

  return (
    <Card variant="bordered" padding="lg" style={card}>
      <h3 style={{ ...title, fontSize: '16px' }}>🚐 Van wrap ({data?.source ?? 'VAN-01'})</h3>
      <p style={small}>
        Visitors are counted once per phone or browser, texters once per number, and customers once each. A booking is stamped VAN-01 when it comes from the van page (even after
        looking at other pages, for 60 days) or from a number that texted PICKUP in the last 60 days.
      </p>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', margin: '12px 0' }}>
        <span style={{ color: '#cbd5e1', fontSize: '13px' }}>Show</span>
        {RANGES.map((r) => (
          <Button key={r.days} variant={r.days === days ? 'outlineGold' : 'outlineLight'} size="sm" onClick={() => setDays(r.days)} aria-pressed={r.days === days}>
            {r.label}
          </Button>
        ))}
      </div>
      {isError ? (
        <p style={{ color: '#fca5a5', margin: 0 }}>Could not load the van report.</p>
      ) : isLoading || !data ? (
        <p style={{ color: '#cbd5e1', margin: 0 }}>Loading…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Step', 'People', ''].map((h, i) => (
                <th key={i} style={head}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value, note]) => {
              const sub = label.startsWith('  ');
              return (
                <tr key={label}>
                  <td style={{ ...cell, paddingLeft: sub ? '24px' : cell.padding, color: sub ? '#94a3b8' : cell.color }}>{label.trim()}</td>
                  <td style={{ ...cell, fontWeight: sub ? 400 : 700 }}>{value}</td>
                  <td style={{ ...cell, color: '#94a3b8' }}>{note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
