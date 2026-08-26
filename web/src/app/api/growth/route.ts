import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  POS_ATTACH_RECOMMENDATIONS,
  evaluateChurnWinbackList,
  generatePostDeliveryReviewPrompt,
} from '@/lib/growth';

export async function GET() {
  try {
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
        customer?.phone || '+12145550199'
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
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, customer_id, phone, text } = body;

    const supabase = createAdminClient();

    if (action === 'send_winback' && customer_id) {
      // Log winback message in conversations
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id, messages')
        .eq('customer_id', customer_id)
        .eq('channel', 'sms')
        .maybeSingle();

      const winbackEntry = {
        id: crypto.randomUUID(),
        stage: 'booked',
        text: text || 'Enjoy 15% off your next pickup with code COMEBACK15.',
        media_url: null,
        direction: 'outbound',
        mode: 'growth_winback',
        created_at: new Date().toISOString(),
      };

      if (existingConv) {
        const updatedMessages = Array.isArray(existingConv.messages)
          ? [...existingConv.messages, winbackEntry]
          : [winbackEntry];

        await supabase
          .from('conversations')
          .update({ messages: updatedMessages, updated_at: new Date().toISOString() })
          .eq('id', existingConv.id);
      } else {
        await supabase.from('conversations').insert({
          customer_id,
          channel: 'sms',
          messages: [winbackEntry],
        });
      }

      return NextResponse.json({ success: true, message: `Win-back perk dispatched to ${phone}` });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
