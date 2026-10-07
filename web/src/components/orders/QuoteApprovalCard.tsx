'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card } from '@/components/ui';
import { DRY_CLEAN_PRICES, SUPPORT_PHONE } from '@/lib/constants';

/**
 * Quotes above the 25% band waiting for the customer (client 2026-10-06, Parts B-D). Shown on
 * the tracking page (guests reach it from the quote message) and on the dashboard order page.
 */
export interface QuoteItem {
  id?: string;
  garment_type: string;
  quantity: number;
  quote_status?: string;
  quoted_unit_price?: number | null;
}

const label = (garmentType: string) =>
  DRY_CLEAN_PRICES[garmentType]?.label ||
  Object.values(DRY_CLEAN_PRICES).find((i) => i.label === garmentType)?.label ||
  garmentType;
const fromPrice = (garmentType: string) =>
  (DRY_CLEAN_PRICES[garmentType] || Object.values(DRY_CLEAN_PRICES).find((i) => i.label === garmentType))?.price;

export function QuoteApprovalCard({ orderId, items }: { orderId: string; items: QuoteItem[] }) {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const pending = items.filter((i) => i.quote_status === 'awaiting_approval' && i.id);
  if (pending.length === 0) return null;

  const answer = async (itemId: string, decision: 'approve' | 'decline') => {
    setBusy(itemId);
    setErrors((prev) => ({ ...prev, [itemId]: '' }));
    try {
      const res = await fetch(`/api/orders/${orderId}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `That didn't go through. Please call us at ${SUPPORT_PHONE}.`);
      setAnswers((prev) => ({ ...prev, [itemId]: data.message }));
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    } catch (err) {
      setErrors((prev) => ({ ...prev, [itemId]: (err as Error).message }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card variant="bordered" padding="lg" style={{ marginBottom: 'var(--space-6)', borderColor: 'var(--color-gold)' }}>
      <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Your OK is needed</h2>
      <p style={{ margin: 'var(--space-2) 0 var(--space-4)' }}>
        After inspecting your order, these items came in more than 25% above the listed price. Everything else goes ahead;
        if you decline, the item comes back unaltered at no charge. Fee and tax are added to approved items.
      </p>
      {pending.map((item) => {
        const id = item.id as string;
        const each = Number(item.quoted_unit_price) || 0;
        return (
          <div key={id} style={{ borderTop: '1px solid var(--color-gray-200)', padding: 'var(--space-3) 0' }}>
            <strong>
              {item.quantity > 1 ? `${item.quantity}x ` : ''}
              {label(item.garment_type)}: ${(each * item.quantity).toFixed(2)}
            </strong>
            <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              Listed from ${Number(fromPrice(item.garment_type) || 0).toFixed(2)}
              {item.quantity > 1 ? ` · $${each.toFixed(2)} each` : ''}
            </span>
            {answers[id] ? (
              <p role="status" style={{ margin: 'var(--space-2) 0 0' }}>{answers[id]}</p>
            ) : (
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                <Button variant="primary" onClick={() => answer(id, 'approve')} disabled={busy !== null}>
                  Approve
                </Button>
                <Button variant="outline" onClick={() => answer(id, 'decline')} disabled={busy !== null}>
                  Decline
                </Button>
              </div>
            )}
            {errors[id] && (
              <p role="alert" style={{ color: 'var(--color-error)', margin: 'var(--space-2) 0 0' }}>
                {errors[id]}
              </p>
            )}
          </div>
        );
      })}
    </Card>
  );
}
