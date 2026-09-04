import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';

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
        total,
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const allOrders = orders || [];

    // Financial Metrics Calculation
    let grossRevenue = 0;
    let inVault = 0;
    let chargedCount = 0;
    let authorizedCount = 0;
    let failedCount = 0;
    let refundedCount = 0;

    const transactions = allOrders.map((o) => {
      const orderTotal = Number(o.total || 0);
      const pStatus = (o.payment_status || 'pending').toLowerCase();

      if (pStatus === 'charged') {
        grossRevenue += orderTotal;
        chargedCount += 1;
      } else if (pStatus === 'authorized' || pStatus === 'pending') {
        inVault += orderTotal;
        authorizedCount += 1;
      } else if (pStatus === 'failed') {
        failedCount += 1;
      } else if (pStatus === 'refunded') {
        refundedCount += 1;
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
        weight_lbs: o.weight_lbs,
        subtotal: Number(o.subtotal || 0),
        discount_amount: Number(o.discount_amount || 0),
        total: orderTotal,
        payment_id: o.payment_id || `sq_auth_${o.id.slice(0, 8)}`,
        payment_status: pStatus,
        payment_date: chargeEvent?.timestamp || o.updated_at || o.created_at,
        charge_note: chargeEvent?.note || null,
        items: o.items || [],
        created_at: o.created_at,
        updated_at: o.updated_at,
      };
    });

    const aov = chargedCount > 0 ? Number((grossRevenue / chargedCount).toFixed(2)) : 0;

    return NextResponse.json({
      summary: {
        gross_revenue: Number(grossRevenue.toFixed(2)),
        in_vault: Number(inVault.toFixed(2)),
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
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
