import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#14): "We should also have a process for inviting customers to leave
// a Google review after their order has been completed." The morning after a delivery, once per
// customer, to every customer (Google does not allow asking only the happy ones).
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
let idSeq = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}`;

function table(name: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: 'select' | 'insert' | 'update' = 'select';
  let values: Row = {};
  let head = false;
  const rows = () => (db[name] ||= []);
  const matching = () => rows().filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (op === 'insert') {
      const row = { id: nextId(), ...values };
      rows().push(row);
      return { data: row, error: null };
    }
    if (op === 'update') {
      matching().forEach((r) => Object.assign(r, values));
      return { data: null, error: null };
    }
    return head ? { data: null, count: matching().length, error: null } : { data: matching(), error: null };
  };
  const b: Record<string, unknown> = {
    select: (_c?: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), b),
    insert: (v: Row) => ((op = 'insert'), (values = v), b),
    update: (v: Row) => ((op = 'update'), (values = v), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), b),
    lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), b),
    limit: () => b,
    single: async () => run(),
    maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return b;
}
const admin = { from: table };
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
const contact = vi.fn(async (m: Record<string, unknown>) => ({ ok: Boolean(m), channel: 'email' }));
vi.mock('@/lib/messaging/contact', () => ({ sendContactMessage: (m: Record<string, unknown>) => contact(m) }));

import { sendReviewRequests, reviewRequestEmailText } from '@/lib/review-request';
import { OWN_TEXT_DEFAULTS, checkMessageText } from '@/lib/message-tests';

const supabase = admin as never;
const NOW = new Date('2026-10-21T14:00:00Z'); // the morning after the delivery on October 20
const ID = '11111111-2222-4333-8444-555555555555';
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.customers = [{ id: 'cust-1', email: 'dana@example.com', full_name: 'Dana Lee', phone: '+12145550100', role: 'customer', sms_promotions_consent: false }];
  db.orders = [{ id: ID, customer_id: 'cust-1', status: 'delivered', customer: db.customers[0] }];
  db.order_events = [{ order_id: ID, status: 'delivered', timestamp: '2026-10-20T18:00:00.000Z' }];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
  contact.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('Google review request', () => {
  it('goes the morning after delivery, by email unless they agreed to promotional texts, with a tracked link to /review', async () => {
    expect(await sendReviewRequests(supabase, NOW)).toEqual({ sent: 1 });
    const message = contact.mock.calls[0][0];
    expect(message).toMatchObject({ smsConsent: false, title: 'How did we do?' });
    expect(message.body).toMatch(
      /^First Eleven Cleaners: Hi Dana, thank you for trusting us with your garments\. How did we do\? A short Google review helps other DFW customers find us: \S+\/m\/[0-9a-f-]{36}\. Reply STOP to opt out\.$/
    );
    expect(message.emailBody).not.toContain('Reply STOP');
    expect(db.message_sends).toEqual([expect.objectContaining({ message_key: 'review_request', variant: 'A', customer_id: 'cust-1', order_id: ID, target_url: expect.stringMatching(/\/review$/) })]);
  });

  it('once per customer, ever', async () => {
    await sendReviewRequests(supabase, NOW);
    contact.mockClear();
    db.orders.push({ id: 'second', customer_id: 'cust-1', status: 'delivered', customer: db.customers[0] });
    db.order_events.push({ order_id: 'second', status: 'delivered', timestamp: '2026-10-20T20:00:00.000Z' });
    expect(await sendReviewRequests(supabase, NOW)).toEqual({ sent: 0 });
    expect(contact).not.toHaveBeenCalled();
  });

  it('not on the delivery day, and not to staff', async () => {
    expect(await sendReviewRequests(supabase, new Date('2026-10-20T22:00:00Z'))).toEqual({ sent: 0 });
    db.customers[0].role = 'admin';
    expect(await sendReviewRequests(supabase, NOW)).toEqual({ sent: 0 });
  });

  it('asks everyone: nothing about ratings, feedback or claims decides who gets it', () => {
    const src = read('src/lib/review-request.ts');
    expect(src.replace(/\/\*\*[\s\S]*?\*\/|\/\/.*$/gm, '')).not.toMatch(/rating|feedback|claims/i);
    expect(read('src/app/api/cron/daily/route.ts')).toContain('sendReviewRequests(supabase, now)');
  });

  it('the default text passes the Message Tests checks, and the email drops "Reply STOP"', () => {
    expect(checkMessageText('review_request', OWN_TEXT_DEFAULTS.review_request)).toBeNull();
    expect(reviewRequestEmailText('Hi. Review us: https://x.test/m/1. Reply STOP to opt out.')).toBe('Hi. Review us: https://x.test/m/1.');
  });
});
