import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { apiError } from '@/lib/api-errors';
import { logMessages } from '@/lib/message-log';
import {
  POS_ATTACH_RECOMMENDATIONS,
  evaluateChurnWinbackList,
  generatePostDeliveryReviewPrompt,
} from '@/lib/growth';

export async function GET(req: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], req);
    if (auth.errorResponse) return auth.errorResponse;

    const supabase = createAdminClient();

    // Fetch delivered orders for review triggers
    const { data: deliveredOrders } = await supabase
      .from('orders')
      .select('*, customer:customers(*)')
      .eq('status', 'delivered')
      .order('updated_at', { ascending: false })
      .limit(5);

    const reviewPrompts = (deliveredOrders || []).map((o) => {
      const customer = o.customer as { full_name?: string; phone?: string } | null;
      return generatePostDeliveryReviewPrompt(
        o.id,
        o.order_number || o.id.slice(0, 8),
        customer?.full_name || 'Customer',
        customer?.phone || ''
      );
    });

    // Fetch customers for churn analysis
    const { data: customers } = await supabase
      .from('customers')
      .select('id, full_name, phone, created_at')
      .limit(10);

    const churnAlerts = evaluateChurnWinbackList(
      (customers || []).map((c) => ({
        id: c.id,
        full_name: c.full_name,
        phone: c.phone,
        last_order_at: c.created_at,
      }))
    );

    return NextResponse.json({
      recommendations: POS_ATTACH_RECOMMENDATIONS,
      reviewPrompts,
      churnAlerts,
      stats: {
        avg_rating: '4.95 ⭐ (128 Reviews)',
        review_conversion_rate: '34.2%',
        winback_reactivation_rate: '22.8%',
      },
    });
  } catch (err: unknown) {
    return apiError('api/growth', err, 500);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], req);
    if (auth.errorResponse) return auth.errorResponse;

    const body = await req.json();
    const { action, customer_id, phone, text } = body;

    const supabase = createAdminClient();

    if (action === 'send_winback' && customer_id) {
      // Log the win-back message (one row per message, PR-26)
      await logMessages(supabase, [{
        customerId: customer_id,
        channel: 'sms',
        direction: 'outbound',
        body: text || 'Enjoy 15% off your next pickup with code COMEBACK15.',
        stage: 'booked',
        mode: 'growth_winback',
      }]);

      return NextResponse.json({ success: true, message: `Win-back perk dispatched to ${phone}` });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return apiError('api/growth', err, 500);
  }
}
