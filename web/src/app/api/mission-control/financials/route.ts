import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { apiError } from '@/lib/api-errors';
import { texasDate, texasDayStartUtc, addDaysToDate } from '@/lib/texas-time';

export const dynamic = 'force-dynamic';

const TRANSACTION_LIST_LIMIT = 500;

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;

    const supabase = createAdminClient();

    // Date range in Dallas calendar days (default: the last 90 days). Totals come from SQL over
    // the whole range; the transaction list is capped at the 500 most recent (PR-14).
    const { searchParams } = new URL(request.url);
    const isDate = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
    const to = isDate(searchParams.get('to')) ? (searchParams.get('to') as string) : texasDate();
    const from = isDate(searchParams.get('from')) ? (searchParams.get('from') as string) : addDaysToDate(to, -89);

    const [listRes, summaryRes] = await Promise.all([
      supabase
        .from('orders')
        .select(`
        id,
        order_number,
        status,
        order_type,
        weight_lbs,
        subtotal,
        discount_amount,
        express_surcharge,
        environmental_fee,
        sales_tax,
        total,
        refunded_amount,
        payment_id,
        payment_status,
        notes,
        created_at,
        updated_at,
        customer:customers(id, full_name, email, phone),
        address:addresses(id, street, unit, city, state, zip),
        items:order_items(id, garment_type, service_type, quantity, unit_price, subtotal),
        events:order_events(id, status, triggered_by, timestamp, note)
      `, { count: 'exact' })
        .gte('created_at', texasDayStartUtc(from))
        .lt('created_at', texasDayStartUtc(addDaysToDate(to, 1)))
        .order('created_at', { ascending: false })
        .limit(TRANSACTION_LIST_LIMIT),
      supabase.rpc('order_financial_summary', { p_from: from, p_to: to }),
    ]);

    const { data: orders, error, count } = listRes;
    if (error || summaryRes.error) {
      console.error('Mission control financials error:', error || summaryRes.error);
      return apiError('api/mission-control/financials', error || summaryRes.error, 500);
    }

    const allOrders = orders || [];

    const transactions = allOrders.map((o) => {
      const pStatus = (o.payment_status || 'pending').toLowerCase();

      // Find the specific charge event if recorded
      const chargeEvent = (o.events as Array<{ status: string; note: string; timestamp: string }> || [])
        .find((e) => e.status === 'charged');

      return {
        id: o.id,
        order_number: o.order_number || o.id.slice(0, 8),
        customer: o.customer,
        address: o.address,
        order_type: o.order_type,
        status: o.status,
        weight_lbs: o.weight_lbs,
        subtotal: Number(o.subtotal || 0),
        discount_amount: Number(o.discount_amount || 0),
        express_surcharge: Number(o.express_surcharge || 0),
        environmental_fee: o.environmental_fee === null || o.environmental_fee === undefined ? null : Number(o.environmental_fee),
        sales_tax: o.sales_tax === null || o.sales_tax === undefined ? null : Number(o.sales_tax),
        total: Number(o.total || 0),
        refunded_amount: Number(o.refunded_amount || 0),
        // Real Square payment ID only; null until the card is charged (no invented IDs)
        payment_id: o.payment_id || null,
        payment_status: pStatus,
        payment_date: chargeEvent?.timestamp || o.updated_at || o.created_at,
        charge_note: chargeEvent?.note || null,
        items: o.items || [],
        created_at: o.created_at,
        updated_at: o.updated_at,
      };
    });

    // Summary from SQL (order_financial_summary): money collected through Square net of
    // refunds; "in vault" is uncharged money owed on live (not cancelled) orders (PR-15)
    const raw = (summaryRes.data || {}) as Record<string, unknown>;
    const num = (k: string) => Number(raw[k]) || 0;

    return NextResponse.json({
      range: { from, to },
      truncated: (count ?? transactions.length) > transactions.length,
      summary: {
        gross_revenue: num('gross_revenue'),
        refunded_total: num('refunded_total'),
        net_revenue: num('net_revenue'),
        sales_tax_collected: num('sales_tax_collected'),
        environmental_fees_collected: num('environmental_fees_collected'),
        in_vault: num('in_vault'),
        aov: num('aov'),
        total_transactions: num('total_transactions'),
        charged_count: num('charged_count'),
        authorized_count: num('authorized_count'),
        failed_count: num('failed_count'),
        refunded_count: num('refunded_count'),
      },
      transactions,
    });
  } catch (err: unknown) {
    console.error('Financials API error:', err);
    return apiError('api/mission-control/financials', err, 500);
  }
}
