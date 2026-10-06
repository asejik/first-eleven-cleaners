'use client';

import type { Order } from '@/types';
import { paymentState, paymentWatchlists, ladderStep, type PaymentStateOrder } from '@/lib/payment-state';

/**
 * Payment states on each order card (Authorized / Captured / Payment Needed / Card needed)
 * and the three daily watch lists for Mission Control (client 2026-10-06, Part A).
 */
const TONES = {
  ok: { background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'rgba(16, 185, 129, 0.35)' },
  info: { background: 'rgba(201, 161, 74, 0.15)', color: 'var(--color-gold)', border: 'rgba(201, 161, 74, 0.35)' },
  alert: { background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'rgba(239, 68, 68, 0.35)' },
  neutral: { background: 'rgba(148, 163, 184, 0.12)', color: '#cbd5e1', border: 'rgba(148, 163, 184, 0.3)' },
} as const;

const asState = (o: Order): PaymentStateOrder => ({ ...o, order_number: o.order_number ?? null });

export function PaymentStateBadge({ order }: { order: Order }) {
  const state = paymentState(asState(order));
  const tone = TONES[state.tone];
  const text =
    state.key === 'payment_needed'
      ? `⚠️ Payment Needed $${state.amount.toFixed(2)} · ${ladderStep(order.payment_reminder_stage)}`
      : state.key === 'card_needed'
        ? '⚠️ Card needed before pickup'
        : state.label;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: '11px',
        fontWeight: 700,
        background: tone.background,
        color: tone.color,
        border: `1px solid ${tone.border}`,
        borderRadius: '4px',
        padding: '3px 7px',
        margin: '6px 0',
      }}
    >
      {text}
    </div>
  );
}

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

export function PaymentWatchlists({ orders }: { orders: Order[] }) {
  const lists = paymentWatchlists(orders.map(asState));
  if (!lists.paymentNeeded.length && !lists.cardNeeded.length && !lists.holdsExpiring.length) return null;

  const section = (title: string, rows: PaymentStateOrder[], detail: (o: PaymentStateOrder) => string) =>
    rows.length > 0 && (
      <div style={{ flex: '1 1 260px' }}>
        <h3 style={{ fontSize: 'var(--text-sm)', color: '#ffffff', margin: '0 0 6px' }}>
          {title} ({rows.length})
        </h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 'var(--text-xs)', color: '#cbd5e1' }}>
          {rows.map((o) => (
            <li key={o.id} style={{ padding: '4px 0', borderBottom: '1px solid #1e293b' }}>
              <strong style={{ color: '#ffffff' }}>#{o.order_number || o.id.slice(0, 8)}</strong> · {detail(o)}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <section
      aria-label="Payment watch lists"
      style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', background: '#131d35', border: '1px solid #334155', borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginBottom: '16px' }}
    >
      {section('📞 Call today', lists.callList, (o) => `$${(Number(o.amount_due) > 0 ? Number(o.amount_due) : Number(o.total) || 0).toFixed(2)} owed · ${ladderStep(o.payment_reminder_stage)}`)}
      {section('💳 Payment Needed', lists.paymentNeeded, (o) => `$${(Number(o.amount_due) > 0 ? Number(o.amount_due) : Number(o.total) || 0).toFixed(2)} since ${fmt(o.payment_needed_since)} · ${ladderStep(o.payment_reminder_stage)} · delivery held`)}
      {section('🪪 Card needed before pickup', lists.cardNeeded, (o) => `pickup ${o.pickup_date || ''}`)}
      {section('⏳ Holds expiring within 48 h', lists.holdsExpiring, (o) => `expires ${fmt(o.hold_expires_at)} (Dallas) · ${o.status.replace(/_/g, ' ')}`)}
    </section>
  );
}
