'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { SUPPORT_PHONE, DRY_CLEAN_PRICES } from '@/lib/constants';
import type { Order } from '@/types';

/**
 * The two taps on the itemized ticket (client 2026-10-06, Part A): "Looks good" closes the
 * loop; "Something's off" opens a Make It Right claim staff resolve the same day. Shown on
 * the tracking page, which guests reach through the link in their receipt.
 */
const money = (n: number | null | undefined) => `$${(Number(n) || 0).toFixed(2)}`;
/** Booking stores catalog keys, intake stores labels: show a label either way */
const itemLabel = (garmentType: string) =>
  garmentType === 'wash_fold' ? 'Wash & Fold' : DRY_CLEAN_PRICES[garmentType]?.label || garmentType;

export function TicketFeedbackCard({ orderId, ticket }: { orderId: string; ticket?: Order['ticket'] }) {
  const [mode, setMode] = useState<'choose' | 'report' | 'done'>('choose');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const send = async (body: { response: 'looks_good' } | { response: 'something_off'; message: string }) => {
    setError(null);
    setIsSending(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `That didn't go through. Please call us at ${SUPPORT_PHONE}.`);
      setReply(data.message);
      setMode('done');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card variant="bordered" padding="lg" style={{ marginBottom: 'var(--space-6)' }}>
      <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Your itemized ticket</h2>
      {ticket && (
        <table style={{ width: '100%', marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', borderCollapse: 'collapse' }}>
          <tbody>
            {ticket.items.map((item, i) => (
              <tr key={i}>
                <td style={{ padding: '4px 0' }}>
                  {item.quantity}x {itemLabel(item.garment_type)}
                </td>
                <td style={{ textAlign: 'right' }}>{money(item.subtotal)}</td>
              </tr>
            ))}
            {[
              ['Express surcharge', ticket.express_surcharge, '+'],
              ['Discount', ticket.discount_amount, '-'],
              ['Environmental fee', ticket.environmental_fee, '+'],
              ['Sales tax', ticket.sales_tax, '+'],
            ]
              .filter(([, amount]) => Number(amount) > 0)
              .map(([label, amount, sign]) => (
                <tr key={String(label)}>
                  <td style={{ padding: '4px 0', color: 'var(--color-text-secondary)' }}>{label}</td>
                  <td style={{ textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                    {sign}
                    {money(amount as number)}
                  </td>
                </tr>
              ))}
            <tr>
              <td style={{ padding: '6px 0', fontWeight: 700, borderTop: '1px solid var(--color-gray-200)' }}>Total charged</td>
              <td style={{ textAlign: 'right', fontWeight: 700, borderTop: '1px solid var(--color-gray-200)' }}>{money(ticket.total)}</td>
            </tr>
          </tbody>
        </table>
      )}
      {mode === 'done' ? (
        <p role="status" style={{ margin: 'var(--space-2) 0 0' }}>{reply}</p>
      ) : (
        <>
          <p style={{ margin: 'var(--space-2) 0 var(--space-4)' }}>
            Check the items and photos below. Not right? One tap to Make It Right.
          </p>
          {mode === 'choose' ? (
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={() => send({ response: 'looks_good' })} disabled={isSending}>
                Looks good
              </Button>
              <Button variant="outline" onClick={() => setMode('report')} disabled={isSending}>
                Something&apos;s off
              </Button>
            </div>
          ) : (
            <div>
              <label htmlFor="ticket-issue" style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                What looks wrong?
              </label>
              <textarea
                id="ticket-issue"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={1000}
                style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-gray-300)' }}
              />
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
                <Button
                  variant="primary"
                  onClick={() => send({ response: 'something_off', message })}
                  disabled={isSending || message.trim().length < 5}
                >
                  Send to Make It Right
                </Button>
                <Button variant="outline" onClick={() => setMode('choose')} disabled={isSending}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" style={{ color: 'var(--color-error)', margin: 'var(--space-3) 0 0' }}>
          {error}
        </p>
      )}
    </Card>
  );
}
