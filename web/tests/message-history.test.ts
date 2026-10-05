import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// PR-26: message history is one row per message. Two messages at once used to
// read the same conversations.messages array and write it back, losing one.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const { db } = vi.hoisted(() => ({
  db: {
    conversations: [] as Row[],
    messages: [] as Row[],
    queries: [] as { table: string; filters: [string, unknown][]; limit?: number }[],
  },
}));

const tick = () => new Promise((r) => setTimeout(r, 5));

function builder(table: string) {
  let op = 'select';
  let values: Row | Row[] = {};
  const filters: [string, unknown][] = [];
  let limit: number | undefined;
  const run = async () => {
    await tick(); // let simultaneous requests interleave, like a real network round trip
    if (table === 'orders') return { data: { customer_id: 'cust-1', customer: { email: null } }, error: null };
    if (table === 'messages') {
      if (op === 'insert') {
        for (const v of [values].flat()) {
          if (v.order_id !== null && v.order_id !== undefined && !/^[0-9a-f-]{36}$/.test(String(v.order_id))) {
            return { data: null, error: { message: 'invalid input syntax for type uuid' } };
          }
          db.messages.push({ id: `m${db.messages.length + 1}`, created_at: new Date().toISOString(), ...v });
        }
        return { data: null, error: null };
      }
      db.queries.push({ table, filters: [...filters], limit });
      const rows = db.messages
        .filter((m) => filters.every(([k, val]) => m[k] === val))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, limit ?? 1000)
        .map((m) => ({ ...m, customer: { full_name: 'Jane Doe', phone: '+12145550100' } }));
      return { data: rows, error: null };
    }
    if (table === 'conversations') {
      if (op === 'insert') {
        db.conversations.push({ id: `c${db.conversations.length + 1}`, ...(values as Row) });
        return { data: null, error: null };
      }
      if (op === 'update') {
        const row = db.conversations.find((c) => filters.every(([k, val]) => c[k] === val));
        if (row) Object.assign(row, values);
        return { data: null, error: null };
      }
      const row = db.conversations.find((c) => filters.every(([k, val]) => c[k] === val));
      return { data: row ? JSON.parse(JSON.stringify(row)) : null, error: null };
    }
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (v: Row | Row[]) => {
      op = 'insert';
      values = v;
      return b;
    },
    update: (v: Row) => {
      op = 'update';
      values = v;
      return b;
    },
    eq: (k: string, v: unknown) => {
      filters.push([k, v]);
      return b;
    },
    order: () => b,
    limit: (n: number) => {
      limit = n;
      return b;
    },
    maybeSingle: run,
    single: run,
    then: (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
  };
  return b;
}

const supabase = { from: (t: string) => builder(t) };
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => supabase }));
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: { id: 'admin-1', role: 'admin' }, user: {} }),
}));
vi.mock('@/lib/resend', () => ({ sendEmail: vi.fn(async () => ({ success: true })), buildStageNotificationEmailHtml: () => '' }));
vi.mock('@/lib/storage', () => ({
  withSignedPhotoUrls: async <T,>(v: T) => v,
  signStorageUrl: async (u: string) => u,
  MMS_PHOTO_LINK_TTL_SECONDS: 60,
}));

import { SimulatedMessageProvider } from '@/lib/messaging';
import { logMessages, recentMessages } from '@/lib/message-log';
import { GET as notificationsGET } from '@/app/api/notifications/route';

const ORDER_ID = '0b0e0c0a-1111-4222-8333-444455556666';

function payload(stage: 'booked' | 'picked_up') {
  return {
    orderId: ORDER_ID,
    orderNumber: 'F11-2026-HIST',
    customerName: 'Jane Doe',
    customerPhone: '+12145550100',
    stage,
    trackingUrl: 'https://example.com/track/1',
  };
}

/** Every message saved, whichever way it was stored. */
function storedCount() {
  const inArrays = db.conversations.reduce((n, c) => n + (Array.isArray(c.messages) ? c.messages.length : 0), 0);
  return db.messages.length + inArrays;
}

beforeEach(() => {
  db.conversations = [{ id: 'c1', customer_id: 'cust-1', channel: 'sms', messages: [] }];
  db.messages = [];
  db.queries = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('Message history keeps every message (PR-26)', () => {
  it('two notifications sent at the same moment are both recorded', async () => {
    const provider = new SimulatedMessageProvider();
    await Promise.all([provider.dispatchStageNotification(payload('booked')), provider.dispatchStageNotification(payload('picked_up'))]);
    expect(storedCount()).toBe(2);
    expect(db.messages.map((m) => m.stage).sort()).toEqual(['booked', 'picked_up']);
    expect(db.messages[0]).toMatchObject({ customer_id: 'cust-1', channel: 'sms', direction: 'outbound', order_id: ORDER_ID, mode: 'simulated' });
  });

  it('a bad order reference is dropped rather than losing the message', async () => {
    const ok = await logMessages(supabase as never, [{ customerId: 'cust-1', channel: 'sms', direction: 'inbound', body: 'hi', orderId: 'not-an-id' }]);
    expect(ok).toBe(true);
    expect(db.messages[0]).toMatchObject({ body: 'hi', order_id: null });
  });

  it('reads the latest messages for SMS replies, oldest first', async () => {
    for (let i = 1; i <= 8; i++) {
      db.messages.push({ customer_id: 'cust-1', channel: 'sms', direction: i % 2 ? 'inbound' : 'outbound', body: `msg ${i}`, created_at: `2026-10-05T10:00:0${i}Z` });
    }
    db.messages.push({ customer_id: 'cust-1', channel: 'whatsapp', direction: 'inbound', body: 'other channel', created_at: '2026-10-05T11:00:00Z' });
    const recent = await recentMessages(supabase as never, 'cust-1', 'sms', 6);
    expect(recent.map((m) => m.body)).toEqual(['msg 3', 'msg 4', 'msg 5', 'msg 6', 'msg 7', 'msg 8']);
  });

  it('the Mission Control message feed reads the messages table, newest first and bounded', async () => {
    db.messages.push(
      { id: 'a', customer_id: 'cust-1', channel: 'sms', direction: 'outbound', body: 'Booked!', stage: 'booked', order_id: ORDER_ID, mode: 'simulated', created_at: '2026-10-05T10:00:00Z' },
      { id: 'b', customer_id: 'cust-1', channel: 'sms', direction: 'outbound', body: 'Picked up', stage: 'picked_up', order_id: ORDER_ID, mode: 'simulated', created_at: '2026-10-05T12:00:00Z' }
    );
    const res = await notificationsGET(new Request('http://localhost/api/notifications'));
    const body = await res.json();
    expect(body.notifications.map((n: { text: string }) => n.text)).toEqual(['Picked up', 'Booked!']);
    expect(body.notifications[0]).toMatchObject({ customer_name: 'Jane Doe', channel: 'sms', stage: 'picked_up', order_id: ORDER_ID });
    expect(db.queries[0].limit).toBe(200);

    const filtered = await notificationsGET(new Request(`http://localhost/api/notifications?order_id=${ORDER_ID}`));
    expect((await filtered.json()).notifications).toHaveLength(2);
    expect(db.queries[1].filters).toContainEqual(['order_id', ORDER_ID]);

    const bad = await notificationsGET(new Request('http://localhost/api/notifications?order_id=nope'));
    expect((await bad.json()).notifications).toEqual([]);
  });
});
