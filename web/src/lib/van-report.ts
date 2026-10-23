import type { createAdminClient } from '@/lib/supabase/admin';
import { MARKETING_CHANNELS, VAN_SOURCE, type MarketingChannel } from '@/lib/marketing-source';

/**
 * The van report, VAN-01 (client 2026-10-23): from a look at the van page to money collected.
 * People are counted once: visitors by their browser's anonymous id, texters by their number's
 * hash, customers by customer record. A new customer is one whose first order came from the
 * van; revenue is everything those customers have paid since, less refunds.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const VAN_REPORT_DAYS = [7, 30, 90, 0] as const; // 0: since the start

interface EventRow {
  channel: string;
  event: string;
  visitor_id: string;
}
interface VanOrderRow {
  customer_id: string;
  status: string;
  marketing_channel: string | null;
}
interface VanCustomerRow {
  id: string;
  marketing_channel: string | null;
}
interface CustomerOrderRow {
  customer_id: string;
  payment_status: string;
  total: number | string | null;
  refunded_amount: number | string | null;
}

type ByChannel = Record<MarketingChannel, number>;
export interface VanReport {
  source: string;
  days: number;
  since: string | null;
  visitors: number;
  pageViews: number;
  visitorsByChannel: ByChannel;
  pickupTexts: number;
  pickupTexters: number;
  scheduleTaps: number;
  bookings: number;
  bookingsByChannel: ByChannel;
  cancelledBookings: number;
  newCustomers: number;
  newCustomersByChannel: ByChannel;
  payingCustomers: number;
  revenue: number;
}

const zero = (): ByChannel => ({ qr: 0, text: 0, typed: 0 });
const asChannel = (c: string | null): MarketingChannel => ((MARKETING_CHANNELS as readonly string[]).includes(c ?? '') ? (c as MarketingChannel) : 'typed');
const money = (n: number | string | null) => Number(n ?? 0) || 0;
const COLLECTED = new Set(['charged', 'refunded']);

export function buildVanReport(
  { events, vanOrders, customers, customerOrders }: { events: EventRow[]; vanOrders: VanOrderRow[]; customers: VanCustomerRow[]; customerOrders: CustomerOrderRow[] },
  days: number,
  since: string | null
): VanReport {
  const unique = (event: string, channel?: MarketingChannel) =>
    new Set(events.filter((e) => e.event === event && (!channel || e.channel === channel)).map((e) => e.visitor_id)).size;

  const visitorsByChannel = zero();
  for (const c of MARKETING_CHANNELS) visitorsByChannel[c] = unique('visit', c);

  const live = vanOrders.filter((o) => o.status !== 'cancelled');
  const bookingsByChannel = zero();
  for (const o of live) bookingsByChannel[asChannel(o.marketing_channel)]++;

  const newCustomersByChannel = zero();
  for (const c of customers) newCustomersByChannel[asChannel(c.marketing_channel)]++;

  const ids = new Set(customers.map((c) => c.id));
  const paying = new Set<string>();
  let revenue = 0;
  for (const o of customerOrders) {
    if (!ids.has(o.customer_id) || !COLLECTED.has(o.payment_status)) continue;
    const kept = money(o.total) - money(o.refunded_amount);
    revenue += kept;
    if (kept > 0) paying.add(o.customer_id);
  }

  return {
    source: VAN_SOURCE,
    days,
    since,
    visitors: unique('visit'),
    pageViews: events.filter((e) => e.event === 'visit').length,
    visitorsByChannel,
    pickupTexts: events.filter((e) => e.event === 'text_in').length,
    pickupTexters: unique('text_in'),
    scheduleTaps: unique('book_click'),
    bookings: live.length,
    bookingsByChannel,
    cancelledBookings: vanOrders.length - live.length,
    newCustomers: customers.length,
    newCustomersByChannel,
    payingCustomers: paying.size,
    revenue: Math.round(revenue * 100) / 100,
  };
}

export async function loadVanReport(supabase: AdminClient, days: number, now: Date = new Date()): Promise<VanReport> {
  const since = days > 0 ? new Date(now.getTime() - days * 86_400_000).toISOString() : null;
  let eventsQuery = supabase.from('marketing_events').select('channel, event, visitor_id').eq('source', VAN_SOURCE);
  let ordersQuery = supabase.from('orders').select('customer_id, status, marketing_channel').eq('marketing_source', VAN_SOURCE);
  let customersQuery = supabase.from('customers').select('id, marketing_channel').eq('marketing_source', VAN_SOURCE);
  if (since) {
    eventsQuery = eventsQuery.gte('created_at', since);
    ordersQuery = ordersQuery.gte('created_at', since);
    customersQuery = customersQuery.gte('marketing_source_at', since);
  }
  const [events, vanOrders, customers] = await Promise.all([eventsQuery.limit(50000), ordersQuery.limit(10000), customersQuery.limit(10000)]);
  for (const r of [events, vanOrders, customers]) if (r.error) throw r.error;

  const ids = (customers.data ?? []).map((c) => c.id);
  let customerOrders: CustomerOrderRow[] = [];
  if (ids.length > 0) {
    const { data, error } = await supabase.from('orders').select('customer_id, payment_status, total, refunded_amount').in('customer_id', ids).limit(20000);
    if (error) throw error;
    customerOrders = data ?? [];
  }
  return buildVanReport({ events: events.data ?? [], vanOrders: vanOrders.data ?? [], customers: customers.data ?? [], customerOrders }, days, since);
}
