import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client 2026-10-08 (item 5): "every Routine member gets one on their first
// pickup... just a 'bag delivered' checkbox per member in Mission Control so
// the driver knows who still needs theirs."
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const audit: Row[] = [];

function table(name: string) {
  type Filter = (r: Row) => boolean;
  const filters: Filter[] = [];
  let op: 'select' | 'update' = 'select';
  let values: Row = {};
  const rows = () => (db[name] ||= []);
  const matching = () => rows().filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (op === 'update') {
      const hit = matching();
      hit.forEach((r) => Object.assign(r, values));
      return { data: hit, error: null };
    }
    return { data: matching(), error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    update: (v: Row) => ((op = 'update'), (values = v), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    gte: () => b,
    order: () => b,
    limit: () => b,
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: table }) }));
let role = 'admin';
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async (roles: string[]) =>
    roles.includes(role)
      ? { customer: { id: 'admin-1', email: 'ops@firstelevencleaners.com', full_name: 'Ops', role }, user: { id: 'admin-1' } }
      : { errorResponse: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) },
}));
vi.mock('@/lib/audit-log', () => ({ recordAdminAction: async (_s: unknown, entry: Row) => void audit.push(entry) }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimitAsync: async () => ({ allowed: true }), getClientIp: () => '127.0.0.1' }));
vi.mock('@/lib/storage', () => ({ resolveAndUploadPhotoUrl: async (u: string) => u, withSignedPhotoUrls: async <T,>(v: T) => v }));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: vi.fn() } }));
vi.mock('@/lib/express', () => ({ handleExpressDeliverySLA: async () => ({ isExpress: false }) }));

import { PATCH } from '@/app/api/mission-control/routine/route';
import { GET as driverGET } from '@/app/api/driver/route';

const MEMBER = '33333333-aaaa-4bbb-8ccc-dddddddddddd';
const patch = (body: Row) => PATCH(new Request('http://localhost/api/mission-control/routine', { method: 'PATCH', body: JSON.stringify(body) }));

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  audit.length = 0;
  role = 'admin';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Bag delivered (Mission Control)', () => {
  it('ticking records when and who, in the audit log; clearing undoes it', async () => {
    db.routine_memberships = [{ id: MEMBER, customer_id: 'c-1', status: 'active', bag_delivered_at: null }];
    const res = await patch({ id: MEMBER, bag_delivered: true });
    expect(res.status).toBe(200);
    expect(db.routine_memberships[0]).toMatchObject({ bag_delivered_at: expect.any(String), bag_delivered_by: 'ops@firstelevencleaners.com' });
    expect(audit).toContainEqual(expect.objectContaining({ action: 'routine.bag_delivered', targetId: MEMBER }));
    await patch({ id: MEMBER, bag_delivered: false });
    expect(db.routine_memberships[0]).toMatchObject({ bag_delivered_at: null, bag_delivered_by: null });
  });

  it('admins only', async () => {
    role = 'driver';
    expect((await patch({ id: MEMBER, bag_delivered: true })).status).toBe(403);
  });
});

describe('The driver sees who still needs their bag', () => {
  const pickup = (id: string, customer_id: string): Row => ({
    id,
    order_number: `F11-${id}`,
    customer_id,
    status: 'booked',
    pickup_window: 'morning',
    customer: { id: customer_id, full_name: 'Pat', phone: '+12145550100', preferences: null },
    address: { street: '1 Main St', city: 'Dallas', state: 'TX', zip: '75205' },
    photos: [],
    events: [],
  });

  it('a member without a bag is flagged; a member with one, or a non-member, is not', async () => {
    db.orders = [pickup('o1', 'c-new'), pickup('o2', 'c-has-bag'), pickup('o3', 'c-guest')];
    db.routine_memberships = [
      { id: 'm1', customer_id: 'c-new', status: 'active', bag_delivered_at: null },
      { id: 'm2', customer_id: 'c-has-bag', status: 'active', bag_delivered_at: '2026-10-05T12:00:00Z' },
    ];
    const body = await (await driverGET(new Request('http://localhost/api/driver'))).json();
    const flags = Object.fromEntries((body.pickups as Row[]).map((p) => [p.id, p.needs_routine_bag]));
    expect(flags).toEqual({ o1: true, o2: false, o3: false });
  });

  it('the stop card shows the reminder', () => {
    const card = readFileSync(join(__dirname, '..', 'src', 'components', 'driver', 'DriverStopCard.tsx'), 'utf8');
    expect(card).toContain('order.needs_routine_bag');
    expect(card).toContain('Bring a Routine bag');
    // Founders get a numbered one (client 2026-10-10)
    expect(card).toContain('(Founding, numbered #${order.routine_bag_number})');
  });
});
