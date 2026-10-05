import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { apiError } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;

    const supabase = createAdminClient();

    const { data: orders, error } = await supabase
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
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Mission control financials error:', error);
      return apiError('api/mission-control/financials', error, 500);
    }

    const allOrders = orders || [];

    // Financial metrics (PR-15): revenue is money actually collected through Square, net of
    // refunds; "in vault" is uncharged money still owed on live orders (not cancelled ones).
    const cents = (n: unknown) => Math.round((Number(n) || 0) * 100);
    let grossCents = 0;
    let refundedCents = 0;
    let inVaultCents = 0;
    let taxCents = 0;
    let feeCents = 0;
    let chargedCount = 0;
    let authorizedCount = 0;
    let failedCount = 0;
    let refundedCount = 0;

    const transactions = allOrders.map((o) => {
      const pStatus = (o.payment_status || 'pending').toLowerCase();
      const collected = pStatus === 'charged' || pStatus === 'refunded';

      if (collected) {
        grossCents += cents(o.total);
        refundedCents += cents(o.refunded_amount);
        taxCents += cents(o.sales_tax);
        feeCents += cents(o.environmental_fee);
        if (pStatus === 'refunded') refundedCount += 1;
        else chargedCount += 1;
      } else if ((pStatus === 'authorized' || pStatus === 'pending') && o.status !== 'cancelled') {
        inVaultCents += cents(o.total);
        authorizedCount += 1;
      } else if (pStatus === 'failed') {
        failedCount += 1;
      }

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

    const paidCount = chargedCount + refundedCount;
    const aov = paidCount > 0 ? Number((grossCents / 100 / paidCount).toFixed(2)) : 0;

    return NextResponse.json({
      summary: {
        gross_revenue: grossCents / 100,
        refunded_total: refundedCents / 100,
        net_revenue: (grossCents - refundedCents) / 100,
        sales_tax_collected: taxCents / 100,
        environmental_fees_collected: feeCents / 100,
        in_vault: inVaultCents / 100,
        aov,
        total_transactions: transactions.length,
        charged_count: chargedCount,
        authorized_count: authorizedCount,
        failed_count: failedCount,
        refunded_count: refundedCount,
      },
      transactions,
    });
  } catch (err: unknown) {
    console.error('Financials API error:', err);
    return apiError('api/mission-control/financials', err, 500);
  }
}
