import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { paymentState, paymentWatchlists, ladderStep, type PaymentStateOrder } from '@/lib/payment-state';

// ---------------------------------------------------------------------------
// Client 2026-10-06, Part A: Mission Control shows Authorized / Captured /
// Payment Needed, and daily lists of Payment Needed orders (with the call
// list), cards needed before pickup, and holds expiring within 48 hours.
// ---------------------------------------------------------------------------
const order = (o: Partial<PaymentStateOrder>): PaymentStateOrder => ({
  id: crypto.randomUUID(),
  status: 'booked',
  payment_status: 'pending',
  total: 100,
  ...o,
});

describe('Payment state names', () => {
  it.each([
    [{ payment_status: 'charged', status: 'in_cleaning' }, 'Captured'],
    [{ payment_status: 'failed', status: 'in_cleaning', amount_due: 34.25 }, 'Payment Needed'],
    [{ payment_status: 'authorized', hold_status: 'held' }, 'Authorized'],
    [{ payment_status: 'pending', hold_status: 'declined' }, 'Card needed before pickup'],
    [{ payment_status: 'pending', hold_status: 'scheduled' }, 'Card on file'],
    [{ payment_status: 'refunded', status: 'delivered' }, 'Refunded'],
  ] as const)('%o is %s', (fields, label) => {
    expect(paymentState(order(fields)).label).toBe(label);
  });

  it('Payment Needed carries the amount still owed', () => {
    expect(paymentState(order({ payment_status: 'failed', amount_due: 34.25, total: 130.25 }))).toMatchObject({ amount: 34.25 });
    expect(paymentState(order({ payment_status: 'failed', amount_due: 0, total: 70 }))).toMatchObject({ amount: 70 });
  });

  it('names the ladder steps', () => {
    expect([0, 1, 2, 3].map(ladderStep)).toEqual(['Customer asked for a new card', 'Reminder sent', 'Staff call due', 'Owner decision']);
  });
});

describe('Daily watch lists', () => {
  const now = new Date('2026-10-07T14:00:00Z');
  const orders = [
    order({ order_number: 'A', status: 'in_cleaning', payment_status: 'failed', payment_reminder_stage: 2, payment_needed_since: '2026-10-05T10:00:00Z' }),
    order({ order_number: 'B', status: 'weighed_itemized', payment_status: 'failed', payment_reminder_stage: 0, payment_needed_since: '2026-10-07T09:00:00Z' }),
    order({ order_number: 'C', status: 'booked', hold_status: 'declined' }),
    order({ order_number: 'D', status: 'picked_up', hold_status: 'held', hold_expires_at: '2026-10-08T20:00:00Z' }),
    order({ order_number: 'E', status: 'booked', hold_status: 'held', hold_expires_at: '2026-10-13T20:00:00Z' }),
    order({ order_number: 'F', status: 'cancelled', payment_status: 'failed' }),
  ];
  const numbers = (rows: PaymentStateOrder[]) => rows.map((o) => o.order_number);

  it('lists Payment Needed orders oldest first, and the call list from 48 hours', () => {
    const lists = paymentWatchlists(orders, now);
    expect(numbers(lists.paymentNeeded)).toEqual(['A', 'B']);
    expect(numbers(lists.callList)).toEqual(['A']);
  });

  it('lists cards needed before pickup and holds expiring within 48 hours', () => {
    const lists = paymentWatchlists(orders, now);
    expect(numbers(lists.cardNeeded)).toEqual(['C']);
    expect(numbers(lists.holdsExpiring)).toEqual(['D']);
  });

  it('Mission Control shows the lists and a payment badge on every order card', () => {
    const src = (rel: string) => readFileSync(join(__dirname, '..', 'src', ...rel.split('/')), 'utf8');
    expect(src('app/mission-control/page.tsx')).toContain('<PaymentWatchlists orders={orders} />');
    expect(src('components/mission-control/KanbanBoard.tsx')).toContain('<PaymentStateBadge order={o} />');
    expect(src('app/api/mission-control/route.ts')).toMatch(/hold_expires_at,\s+payment_needed_since,\s+payment_reminder_stage/);
  });
});
