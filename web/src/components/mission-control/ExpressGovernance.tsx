'use client';

import { Card, Badge, Button } from '@/components/ui';
import { EXPRESS_DAILY_SLOT_CAP } from '@/lib/constants';
import type { Order } from '@/types';

interface ExpressGovernanceProps {
  orders: Order[];
  onRefresh?: () => void;
}

export function ExpressGovernance({ orders, onRefresh }: ExpressGovernanceProps) {
  // The daily cap the booking server enforces (read-only here; P03 PR-09)
  const slotCap = EXPRESS_DAILY_SLOT_CAP;

  // 2. Filter express orders
  const expressOrders = orders.filter((o) => o.express_tier === 'express_24hr');

  // Tomorrow calculation
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const tomorrowExpressOrders = expressOrders.filter((o) => o.pickup_date === tomorrowStr);
  const remainingTomorrowSlots = Math.max(0, slotCap - tomorrowExpressOrders.length);
  const isTomorrowCapFull = remainingTomorrowSlots === 0;

  // Auto-refund and SLA statistics
  const deliveredExpress = expressOrders.filter((o) => o.status === 'delivered');
  const missedSLAOrders = expressOrders.filter((o) => o.express_auto_refunded || o.events?.some((e) => (e.status as string) === 'express_auto_refund' || (e.status as string) === 'express_refund_failed'));
  const manualRefundOrders = expressOrders.filter((o) => !o.express_auto_refunded && o.events?.some((e) => (e.status as string) === 'express_refund_failed'));
  const totalRefundAmount = missedSLAOrders.reduce((acc, o) => acc + (Number(o.express_refund_amount) || 0), 0);
  const onTimeCount = deliveredExpress.length - missedSLAOrders.length;
  const onTimePct = deliveredExpress.length > 0 ? ((Math.max(0, onTimeCount) / deliveredExpress.length) * 100).toFixed(1) : '100.0';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '16px' }}>
      {/* Top Banner: Capacity Cap Setting */}
      <Card variant="bordered" padding="lg" style={{ background: 'linear-gradient(135deg, rgba(20, 29, 47, 0.95) 0%, rgba(13, 20, 36, 0.98) 100%)', border: '1px solid rgba(201, 161, 74, 0.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '24px' }}>⚡</span>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#ffffff', margin: 0 }}>
                24-Hour Express Program Governance
              </h2>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 9px',
                  borderRadius: '9999px',
                  background: 'rgba(201, 161, 74, 0.2)',
                  color: 'var(--color-gold)',
                  border: '1px solid rgba(201, 161, 74, 0.45)',
                  letterSpacing: '0.02em',
                }}
              >
                Match-Ready Tomorrow
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 9px',
                  borderRadius: '9999px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  letterSpacing: '0.02em',
                }}
              >
                ✓ Capacity Governed
              </span>
            </div>
            <p style={{ color: '#e2e8f0', fontSize: '13px', marginTop: '6px', margin: 0, lineHeight: '1.5' }}>
              Turnaround: Mon–Fri Morning Pickup → Next Morning 7:30–10:00 AM Delivery (<strong style={{ color: 'var(--color-gold)' }}>+50% surcharge, min $15 floor</strong>).
            </p>
          </div>

          {/* Daily Capacity Slot Cap Control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.05)', padding: '10px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)' }}>
            <div>
              <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gold)', display: 'block', fontWeight: 'bold' }}>
                Daily Express Slot Cap
              </label>
              <div style={{ fontSize: '12px', color: '#e2e8f0', marginTop: '2px' }}>
                Active Limit: <strong style={{ color: '#ffffff', fontWeight: 700 }}>{slotCap} slots / day</strong>
              </div>
            </div>

            <div style={{ fontSize: '11px', color: '#94a3b8', maxWidth: '180px' }}>
              Enforced by the booking server. To change it, ask your developer.
            </div>
          </div>
        </div>

        {/* Live Slot Status Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '16px' }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '11px', color: '#cbd5e1', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Tomorrow&apos;s Booked Slots</span>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ffffff', marginTop: '4px' }}>
              {tomorrowExpressOrders.length} <span style={{ fontSize: '13px', color: '#cbd5e1' }}>/ {slotCap} cap</span>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '11px', color: '#cbd5e1', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Tomorrow&apos;s Availability</span>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: isTomorrowCapFull ? '#ef4444' : '#10b981', marginTop: '4px' }}>
              {isTomorrowCapFull ? '⚠️ FULL (Cutoff Reached)' : `✓ ${remainingTomorrowSlots} Slots Open`}
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '11px', color: '#cbd5e1', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>On-Time SLA Delivery Rate</span>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--color-gold)', marginTop: '4px' }}>
              {onTimePct}% <span style={{ fontSize: '12px', color: '#cbd5e1' }}>({onTimeCount} on-time)</span>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px 14px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '11px', color: '#cbd5e1', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Auto-Refunds Triggered</span>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: missedSLAOrders.length > 0 ? '#f59e0b' : '#10b981', marginTop: '4px' }}>
              {missedSLAOrders.length} <span style={{ fontSize: '12px', color: '#cbd5e1' }}>(${totalRefundAmount.toFixed(2)} refunded{manualRefundOrders.length > 0 ? `, ${manualRefundOrders.length} need a manual refund` : ''})</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Auto-Refund SLA Guarantee Explainer */}
      <Card variant="bordered" padding="lg" style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ maxWidth: '740px' }}>
            <h3 style={{ fontSize: '15px', color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
              <span style={{ fontSize: '18px' }}>🛡️</span> 10:00 AM Delivery Window Guarantee Logic
            </h3>
            <p style={{ fontSize: '13px', color: '#e2e8f0', marginTop: '6px', margin: '6px 0 0', lineHeight: '1.6' }}>
              If an Express order is marked delivered after 10:00 AM (Dallas time) on the promised delivery date, the system automatically:
            </p>
            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#e2e8f0', lineHeight: '1.5' }}>
              <div>
                <strong style={{ color: 'var(--color-gold)' }}>1.</strong> Refunds the Express surcharge (<span style={{ color: 'var(--color-gold)', fontWeight: 'bold' }}>$15 min / +50%</span>), plus its fee and tax, to the customer&apos;s card through Square.
              </div>
              <div>
                <strong style={{ color: 'var(--color-gold)' }}>2.</strong> Once Square accepts the refund, sends the customer: <em style={{ color: '#ffffff', background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px' }}>&ldquo;Your Express delivery ran past our window. The Express fee has been refunded automatically — that&apos;s our guarantee.&rdquo;</em>
              </div>
              <div>
                <strong style={{ color: 'var(--color-gold)' }}>3.</strong> Logs the refund as an Express SLA miss in Mission Control. If the refund can&apos;t be made, nothing is sent to the customer and the order timeline says to refund it manually.
              </div>
            </div>
          </div>

        </div>
      </Card>

      {/* Express Order Audit Trail Table */}
      <Card variant="bordered" padding="lg" style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ fontSize: '15px', color: '#ffffff', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚡</span> 24-Hour Express Order Ledger &amp; SLA Tracking ({expressOrders.length})
          </h3>
          <Button
            variant="ghostLight"
            size="sm"
            onClick={onRefresh}
            style={{
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.06)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🔄</span> Refresh Ledger
          </Button>
        </div>

        {expressOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: '#cbd5e1', fontSize: '13px', lineHeight: '1.6' }}>
            No 24-Hour Express orders logged yet. Book an Express pickup from the customer booking flow to see real-time capacity and SLA tracking.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#f1f5f9' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', textAlign: 'left', color: '#cbd5e1', fontWeight: 600 }}>
                  <th style={{ padding: '8px 12px' }}>Order #</th>
                  <th style={{ padding: '8px 12px' }}>Customer</th>
                  <th style={{ padding: '8px 12px' }}>Pickup</th>
                  <th style={{ padding: '8px 12px' }}>Promised Delivery</th>
                  <th style={{ padding: '8px 12px' }}>Subtotal</th>
                  <th style={{ padding: '8px 12px' }}>Express Surcharge</th>
                  <th style={{ padding: '8px 12px' }}>Status</th>
                  <th style={{ padding: '8px 12px' }}>10:00 AM SLA Guarantee</th>
                </tr>
              </thead>
              <tbody>
                {expressOrders.map((o) => {
                  const sub = Number(o.subtotal) || 0;
                  const surcharge = Math.max(sub * 0.5, 15.0);
                  const isDelivered = o.status === 'delivered';
                  const isRefunded = Boolean(o.express_auto_refunded);

                  return (
                    <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 'bold', color: 'var(--color-gold)' }}>
                        #{o.order_number || o.id.slice(0, 8)}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#f8fafc' }}>
                        {o.customer?.full_name || 'Customer'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>
                        {o.pickup_date} (Morning)
                      </td>
                      <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>
                        {o.delivery_date} (Morning 7:30–10 AM)
                      </td>
                      <td style={{ padding: '10px 12px', color: '#f8fafc' }}>
                        ${sub.toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--color-gold)', fontWeight: 'bold' }}>
                        +${surcharge.toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Badge variant={isDelivered ? 'delivered' : 'gold'}>
                          {o.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {isRefunded ? (
                          <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                            ⚡ Auto-Refunded (-${(Number(o.express_refund_amount) || surcharge).toFixed(2)})
                          </span>
                        ) : isDelivered ? (
                          <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                            ✓ Delivered On-Time
                          </span>
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>
                            ⏳ In Flight (Window: 10:00 AM)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
