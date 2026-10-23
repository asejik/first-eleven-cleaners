import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildOrderTwoReport, customerJourneys, loadOrderTwoReport, weekOf, NO_CODE, NO_TERRITORY, type ReportInput, type ReportOrder } from '@/lib/order-two-report';

// ---------------------------------------------------------------------------
// Client 2026-10-14, the Growth panel: "the metric we live by: a customer who completes 2
// orders in their first 21 days", by week, territory, rep code and A/B version.
// ---------------------------------------------------------------------------
const TODAY = '2026-10-14'; // a Wednesday; this week starts Monday Oct 12

const order = (customer_id: string, pickup_date: string, zip: string | null = '75024'): ReportOrder => ({ customer_id, pickup_date, zip });
const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  orders: [],
  repCodes: new Map(),
  territories: new Map([
    ['75024', 'Plano'],
    ['75080', 'Richardson'],
  ]),
  sends: [],
  tests: {},
  ...over,
});

describe('Who reached order two', () => {
  it('a second pickup within 21 days of the first; on day 21 counts, day 22 does not; still open until day 21 has passed', () => {
    const j = customerJourneys(
      [
        order('a', '2026-09-01'),
        order('a', '2026-09-22'), // day 21
        order('b', '2026-09-01'),
        order('b', '2026-09-23'), // day 22
        order('c', '2026-09-30'), // only one, 21 days end Oct 21: still open
        order('d', '2026-09-20'), // only one, 21 days ended Oct 11
        order('e', '2026-10-10'),
        order('e', '2026-10-20'), // booked ahead: already reached
      ],
      TODAY
    );
    expect(j.get('a')).toMatchObject({ first: '2026-09-01', reached: true, open: false });
    expect(j.get('b')).toMatchObject({ reached: false, open: false });
    expect(j.get('c')).toMatchObject({ reached: false, open: true });
    expect(j.get('d')).toMatchObject({ reached: false, open: false });
    expect(j.get('e')).toMatchObject({ reached: true, open: false });
  });

  it('weeks run Monday to Sunday', () => {
    expect(weekOf('2026-10-12')).toBe('2026-10-12');
    expect(weekOf('2026-10-18')).toBe('2026-10-12');
    expect(weekOf('2026-10-19')).toBe('2026-10-19');
  });
});

describe('The report', () => {
  const orders = [
    // Week of Sep 21: x reached, y didn't (closed)
    order('x', '2026-09-22'),
    order('x', '2026-10-01'),
    order('y', '2026-09-22', '75080'),
    // Week of Oct 5: z still open
    order('z', '2026-10-07', '99999'),
    // First order long before the range: not a new customer, even with a later order in it
    order('old', '2026-06-01'),
    order('old', '2026-09-24'),
  ];

  it('counts each week\'s new customers, newest week first; open customers stay out of the rate', () => {
    const r = buildOrderTwoReport(input({ orders }), 4, TODAY);
    expect(r).toMatchObject({ weeks: 4, from: '2026-09-21', to: '2026-10-18', windowDays: 21 });
    expect(r.byWeek.map((w) => w.week)).toEqual(['2026-10-12', '2026-10-05', '2026-09-28', '2026-09-21']);
    expect(r.byWeek[3]).toMatchObject({ weekEnd: '2026-09-27', customers: 2, reached: 1, open: 0, rate: 50 });
    expect(r.byWeek[1]).toMatchObject({ customers: 1, reached: 0, open: 1, rate: null });
    expect(r.byWeek[0]).toMatchObject({ customers: 0, rate: null });
    expect(r.total).toMatchObject({ customers: 3, reached: 1, open: 1, rate: 50 });
  });

  it('by territory of the first order\'s address, and by rep code, with "No territory" and "No code"', () => {
    const r = buildOrderTwoReport(input({ orders, repCodes: new Map([['x', '1D-W1-JM']]) }), 4, TODAY);
    expect(r.byTerritory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Plano', customers: 1, reached: 1, rate: 100 }),
        expect.objectContaining({ label: 'Richardson', customers: 1, reached: 0, rate: 0 }),
        expect.objectContaining({ label: NO_TERRITORY, customers: 1, open: 1, rate: null }),
      ])
    );
    expect(r.byRepCode).toEqual([
      expect.objectContaining({ label: NO_CODE, customers: 2, reached: 0, open: 1, rate: 0 }),
      expect.objectContaining({ label: '1D-W1-JM', customers: 1, reached: 1, rate: 100 }),
    ]);
  });

  it('message tests: each customer counted once, by the version of their first send since the count started', () => {
    const r = buildOrderTwoReport(
      input({
        orders,
        sends: [
          { message_key: 'order_two_nudge', variant: 'A', customer_id: 'x', sent_at: '2026-09-28T15:00:00Z' },
          { message_key: 'order_two_nudge', variant: 'A', customer_id: 'x', sent_at: '2026-09-29T15:00:00Z' },
          { message_key: 'order_two_nudge', variant: 'B', customer_id: 'y', sent_at: '2026-09-29T15:00:00Z' },
          { message_key: 'order_two_nudge', variant: 'B', customer_id: 'z', sent_at: '2026-10-13T15:00:00Z' },
          // Before the count started: left out
          { message_key: 'delivered_rebook', variant: 'A', customer_id: 'x', sent_at: '2026-09-01T15:00:00Z' },
        ],
        tests: { delivered_rebook: { b: '', bOn: false, countFrom: '2026-09-15T00:00:00Z' } },
      }),
      4,
      TODAY
    );
    expect(r.messages).toEqual([
      {
        key: 'order_two_nudge',
        label: 'Day 6 nudge',
        A: expect.objectContaining({ customers: 1, reached: 1, rate: 100 }),
        B: expect.objectContaining({ customers: 2, reached: 0, open: 1, rate: 0 }),
      },
    ]);
  });
});

describe('Loading', () => {
  it('reads every page (more than 1,000 orders), and the first order\'s address ZIP and territory', async () => {
    const tables: Record<string, Record<string, unknown>[]> = {
      orders: [
        ...Array.from({ length: 1500 }, (_, i) => ({ id: `o${String(i).padStart(5, '0')}`, customer_id: `c${i}`, pickup_date: '2026-10-01', address: { zip: '75024' } })),
        { id: 'o99999', customer_id: 'c1', pickup_date: '2026-10-05', address: [{ zip: '75024' }] },
      ],
      customers: [{ id: 'c1', rep_code: '1D-W1-JM' }],
      territory_zips: [{ zip: '75024', territory_id: '1D' }],
      territories: [{ id: '1D', name: 'Plano' }],
      message_sends: [],
    };
    const client = {
      from: (name: string) => {
        const q = {
          select: () => q,
          neq: () => q,
          not: () => q,
          order: () => q,
          range: async (a: number, b: number) => ({ data: tables[name].slice(a, b + 1), error: null }),
        };
        return q;
      },
    };
    const r = await loadOrderTwoReport(client as never, 4, {}, new Date('2026-10-14T18:00:00Z'));
    expect(r.total).toMatchObject({ customers: 1500, reached: 1 });
    expect(r.byTerritory).toEqual([expect.objectContaining({ label: 'Plano', customers: 1500 })]);
    expect(r.byRepCode).toEqual(expect.arrayContaining([expect.objectContaining({ label: '1D-W1-JM', customers: 1, reached: 1 })]));
  });
});

describe('Mission Control', () => {
  it('has the Growth tab with the order-two panel', () => {
    const page = readFileSync(join(__dirname, '..', 'src/app/mission-control/page.tsx'), 'utf8');
    expect(page).toContain("{ id: 'order_two', label: '📈 Growth' }");
    expect(page).toMatch(/activeTab === 'order_two' && \([\s\S]*?<OrderTwoPanel \/>/);
  });
});
