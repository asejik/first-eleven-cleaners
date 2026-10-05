import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { messagingService } from '@/lib/messaging';
import { getAppBaseUrl, type OrderStatusKey } from '@/lib/constants';
import { handleExpressDeliverySLA } from '@/lib/express';
import type { MessagePayload } from '@/lib/messaging/templates';
import { apiError } from '@/lib/api-errors';
import { withSignedPhotoUrls } from '@/lib/storage';
import { chargeHeldOrder, markHeldOrderPaid } from '@/lib/payment-recovery';
import { refundOrder } from '@/lib/refunds';
import { checkMissionControlTransition, requiresCapturedPayment, ORDER_STATUS_KEYS } from '@/lib/order-lifecycle';
import { texasDate } from '@/lib/texas-time';
import { runAfterResponse } from '@/lib/after-response';
import { reportError } from '@/lib/error-reporting';
import { recordAdminAction } from '@/lib/audit-log';
import { getClientIp } from '@/lib/rate-limiter';


export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const offset = (page - 1) * limit;
    const status = searchParams.get('status');

    const supabase = createAdminClient();

    // 1. Fetch paginated orders with specific relational projections
    let ordersQuery = supabase
      .from('orders')
      .select(`
        id,
        order_number,
        customer_id,
        address_id,
        status,
        order_type,
        pickup_date,
        pickup_window,
        delivery_date,
        delivery_window,
        weight_lbs,
        subtotal,
        express_tier,
        promo_code,
        discount_amount,
        total,
        payment_id,
        payment_status,
        notes,
        created_at,
        updated_at,
        customer:customers(id, full_name, email, phone, role),
        address:addresses(id, street, unit, city, state, zip, delivery_notes),
        items:order_items(id, order_id, garment_type, service_type, quantity, unit_price, subtotal, notes),
        photos:garment_photos(id, order_id, photo_type, photo_url, condition_notes, captured_by, captured_at),
        events:order_events(id, order_id, status, timestamp, note, triggered_by)
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (status) {
      ordersQuery = ordersQuery.eq('status', status);
    }

    // 1 & 2. Fetch orders and recent claims concurrently to avoid sequential roundtrip latency
    const claimsQuery = supabase
      .from('claims')
      .select(`
        id,
        order_id,
        customer_id,
        issue_type,
        description,
        photo_urls,
        status,
        resolution_notes,
        created_at,
        updated_at,
        order:orders(id, order_number, pickup_date, total, status),
        customer:customers(id, full_name, email, phone)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    const revenueQuery = supabase
      .from('orders')
      .select('total');

    const [
      { data: allOrders, count: totalOrdersCount, error: ordersErr },
      { data: claims },
      { data: revenueRows }
    ] = await Promise.all([
      ordersQuery.range(offset, offset + limit - 1),
      claimsQuery,
      revenueQuery
    ]);

    if (ordersErr) {
      console.error('Mission Control GET error:', ordersErr);
      return NextResponse.json({ orders: [], stats: null, claims: [] });
    }

    const orders = allOrders || [];

    // 3. Compute KPI Summary
    const activeOrders = orders.filter((o) => o.status !== 'delivered');
    // Dallas calendar day, not UTC (PR-13)
    const todayStr = texasDate();

    const todayOrders = orders.filter((o) => (o.created_at && texasDate(o.created_at) === todayStr) || o.pickup_date === todayStr);
    const todayRevenue = todayOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
    const allTimeRevenue = (revenueRows || []).reduce((acc, o) => acc + (Number(o.total) || 0), 0);

    const totalLbs = orders.reduce((acc, o) => acc + (Number(o.weight_lbs) || 0), 0);
    const totalDryCleanPieces = orders.reduce((acc, o) => {
      const pieces = (o.items || []).reduce((subAcc: number, i: { quantity?: number }) => subAcc + (Number(i.quantity) || 0), 0);
      return acc + pieces;
    }, 0);

    return NextResponse.json(await withSignedPhotoUrls({
      orders,
      claims: claims || [],
      page,
      limit,
      total_count: totalOrdersCount ?? orders.length,
      stats: {
        active_count: activeOrders.length,
        total_count: totalOrdersCount ?? orders.length,
        today_revenue: todayRevenue,
        all_time_revenue: allTimeRevenue,
        total_lbs: totalLbs,
        total_pieces: totalDryCleanPieces,
      },
    }));
  } catch (err) {
    console.error('Mission control query error:', err);
    return apiError('api/mission-control', err, 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;

    const body = await request.json();
    const {
      action = 'advance_stage',
      order_id,
      new_stage,
      claim_id,
      resolution_notes,
      refund_amount,
      claim_status,
      manager_override = false,
      override_reason = '',
    } = body;

    const supabase = createAdminClient();

    // 1. Advance Order Stage Action
    if (action === 'advance_stage') {
      if (!order_id || !new_stage) {
        return NextResponse.json({ error: 'order_id and new_stage are required' }, { status: 400 });
      }
      if (!(ORDER_STATUS_KEYS as readonly string[]).includes(new_stage)) {
        return NextResponse.json({ error: 'Unknown order stage.' }, { status: 400 });
      }

      // Fetch order
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('*, customer:customers(*)')
        .eq('id', order_id)
        .maybeSingle();

      if (orderErr || !order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      // Only allowed moves (PR-02): intake is the only way to Weighed & Itemized
      const transition = checkMissionControlTransition(order.status, new_stage);
      if (!transition.ok) {
        return NextResponse.json({ error: transition.error }, { status: 409 });
      }

      // Keep "Mission Control" in the label: the driver manifest uses it to tell board moves from driver van loads
      const adminLabel = auth.customer?.full_name ? `Mission Control (${auth.customer.full_name})` : 'Mission Control Operator';

      // Payment Guard: an order enters cleaning or delivery only once its card is charged
      const needsOverride = requiresCapturedPayment(new_stage) && order.payment_status !== 'charged';
      if (needsOverride && !manager_override) {
        return NextResponse.json(
          {
            error: `Cannot advance Order #${order.order_number || order.id.slice(0, 8)} to ${new_stage.replace(/_/g, ' ')}: payment is ${order.payment_status || 'not captured'} ($${Number(order.total || 0).toFixed(2)}). Settle payment or authorize Manager Override to proceed.`,
            payment_failed: true,
            requires_override: true,
          },
          { status: 400 }
        );
      }

      // Conditional update: only applies if the order is still in the stage the board saw
      const { data: updatedRows, error: updateErr } = await supabase
        .from('orders')
        .update({ status: new_stage, updated_at: new Date().toISOString() })
        .eq('id', order.id)
        .eq('status', order.status)
        .select('id');

      if (updateErr) {
        return apiError('api/mission-control', updateErr, 500);
      }
      if (!updatedRows || updatedRows.length === 0) {
        return NextResponse.json(
          { error: 'This order was updated by someone else. Refresh the board and try again.' },
          { status: 409 }
        );
      }

      if (needsOverride) {
        await supabase.from('order_events').insert({
          order_id: order.id,
          status: new_stage,
          note: `[MANAGER OVERRIDE] Operator authorized advancement of unpaid order (payment ${order.payment_status || 'unknown'}) to ${new_stage}. Reason: ${override_reason || 'Managerial discretion / corporate invoice'}.`,
          triggered_by: adminLabel,
        });
      }

      // Log event
      await supabase.from('order_events').insert({
        order_id: order.id,
        status: new_stage,
        note: `Stage advanced to ${new_stage} via Mission Control Ops Board.`,
        triggered_by: adminLabel,
      });

      await recordAdminAction(supabase, {
        actor: auth.customer,
        action: 'order.stage_change',
        targetType: 'order',
        targetId: order.id,
        details: {
          order_number: order.order_number,
          from: order.status,
          to: new_stage,
          payment_status: order.payment_status,
          ...(needsOverride ? { manager_override: true, override_reason: override_reason || null } : {}),
        },
        ip: getClientIp(request),
      });

      // Dispatch Notification
      const rawCustomer = order.customer;
      const customer = (Array.isArray(rawCustomer) ? rawCustomer[0] : rawCustomer) as { full_name?: string; phone?: string; email?: string } | null;
      const origin = getAppBaseUrl();

      const payload: MessagePayload = {
        orderId: order.id,
        orderNumber: order.order_number || order.id.slice(0, 8),
        customerName: customer?.full_name || 'Valued Customer',
        customerPhone: customer?.phone || '',
        // No phone on file: email only, never a placeholder number (PR-22)
        ...(customer?.phone ? {} : { smsConsent: false }),
        customerEmail: customer?.email,
        stage: new_stage as OrderStatusKey,
        pickupDate: order.pickup_date,
        pickupWindow: order.pickup_window,
        deliveryDate: order.delivery_date,
        deliveryWindow: order.delivery_window,
        weightLbs: order.weight_lbs,
        total: order.total,
        trackingUrl: `${origin}/track/${order.id}`,
      };

      runAfterResponse(() => messagingService.dispatchStageNotification(payload), 'stage change notification');

      let expressSLAResult = null;
      if (new_stage === 'delivered') {
        expressSLAResult = await handleExpressDeliverySLA(order, new Date());
      }

      return NextResponse.json({ success: true, order_id: order.id, new_status: new_stage, express_sla: expressSLAResult });
    }

    // 2. Resolve Claim Action. A money-back resolution refunds the customer's card through
    // Square first; the claim is marked refunded only once Square accepts it (PR-05).
    if (action === 'resolve_claim') {
      if (!claim_id) {
        return NextResponse.json({ error: 'claim_id is required' }, { status: 400 });
      }

      const refundNum = refund_amount ? Number(refund_amount) : 0;
      if (!Number.isFinite(refundNum) || refundNum < 0) {
        return NextResponse.json({ error: 'Refund amount must be a positive number.' }, { status: 400 });
      }

      const { data: claim } = await supabase
        .from('claims')
        .select('id, order_id, status, refund_amount, square_refund_id')
        .eq('id', claim_id)
        .maybeSingle();
      if (!claim) {
        return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
      }

      const actorLabel = auth.customer?.full_name ? `Mission Control (${auth.customer.full_name})` : 'Mission Control Operator';
      let refundId: string | null = null;

      if (refundNum > 0) {
        if (claim.square_refund_id || claim.status === 'refunded') {
          return NextResponse.json({ error: 'This claim has already been refunded.' }, { status: 409 });
        }
        const { data: claimOrder } = await supabase
          .from('orders')
          .select('id, order_number, total, payment_status, payment_id, refunded_amount')
          .eq('id', claim.order_id)
          .maybeSingle();
        if (!claimOrder) {
          return NextResponse.json({ error: 'The order for this claim was not found.' }, { status: 404 });
        }

        const refund = await refundOrder(supabase, claimOrder, {
          amount: refundNum,
          // One refund per claim, ever (Square limits keys to 45 characters)
          idempotencyKey: `clm_${String(claim.id).replace(/-/g, '')}`.slice(0, 45),
          reason: `Make It Right claim (Order #${claimOrder.order_number || claimOrder.id.slice(0, 8)})`,
          actorLabel,
        });
        if (!refund.ok) {
          return NextResponse.json({ error: refund.error }, { status: refund.status });
        }
        refundId = refund.refundId;
      }

      const formattedNotes = refundNum > 0
        ? `[Refund of $${refundNum.toFixed(2)} issued, Square Refund ${refundId}] ${resolution_notes || 'Resolved under Make It Right guarantee.'}`
        : (resolution_notes || 'Resolved under 100% Make It Right guarantee.');

      const finalStatus = refundNum > 0 ? 'refunded' : (claim_status === 'refunded' ? 'resolved' : (claim_status || 'resolved'));

      const { data: updatedClaim, error: claimErr } = await supabase
        .from('claims')
        .update({
          status: finalStatus,
          resolution_notes: formattedNotes,
          ...(refundNum > 0 ? { refund_amount: Number(refundNum.toFixed(2)), square_refund_id: refundId } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', claim_id)
        .select('id, status, resolution_notes, updated_at')
        .single();

      if (claimErr) {
        if (refundId) {
          console.error(`[Claims] Refund ${refundId} issued but claim ${claim_id} not updated:`, claimErr);
          reportError('claims/refund', claimErr, { alert: true, details: `Square refund ${refundId} issued but claim ${claim_id} not updated` });
        }
        return apiError('api/mission-control', claimErr, 500);
      }

      await recordAdminAction(supabase, {
        actor: auth.customer,
        action: refundNum > 0 ? 'claim.refund' : 'claim.resolve',
        targetType: 'claim',
        targetId: String(claim_id),
        details: {
          order_id: claim.order_id,
          status: finalStatus,
          ...(refundNum > 0 ? { refund_amount: Number(refundNum.toFixed(2)), square_refund_id: refundId } : {}),
        },
        ip: getClientIp(request),
      });

      return NextResponse.json({ success: true, claim: updatedClaim, refund_id: refundId });
    }

    // 3. Payment Hold recovery (PR-04): retry the saved card, or record a payment taken in
    // the Square Dashboard. Both are logged with the admin's name.
    if (action === 'retry_charge' || action === 'mark_paid_external') {
      if (!order_id) {
        return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
      }
      const { data: heldOrder } = await supabase
        .from('orders')
        .select('id, order_number, total, payment_status, square_customer_id, square_card_id')
        .eq('id', order_id)
        .maybeSingle();
      if (!heldOrder) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      const actorLabel = auth.customer?.full_name ? `Mission Control (${auth.customer.full_name})` : 'Mission Control Operator';
      const result =
        action === 'retry_charge'
          ? await chargeHeldOrder(supabase, heldOrder, { keyPrefix: 'rty', actorLabel })
          : await markHeldOrderPaid(supabase, heldOrder, {
              squarePaymentId: String(body.square_payment_id || ''),
              actorLabel,
            });

      await recordAdminAction(supabase, {
        actor: auth.customer,
        action: action === 'retry_charge' ? 'payment.retry_charge' : 'payment.mark_paid_external',
        targetType: 'order',
        targetId: heldOrder.id,
        details: {
          order_number: heldOrder.order_number,
          outcome: result.ok ? 'paid' : 'refused',
          ...(result.ok ? { payment_id: result.paymentId, amount: result.amount } : { error: result.error }),
        },
        ip: getClientIp(request),
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ success: true, payment_id: result.paymentId, amount: result.amount });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    console.error('Mission control action error:', err);
    return apiError('api/mission-control', err, 500);
  }
}
