'use client';

import { useState, useEffect } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { EXPRESS_DAILY_SLOT_CAP } from '@/lib/constants';
import type { Order } from '@/types';

interface ExpressGovernanceProps {
  orders: Order[];
  onRefresh?: () => void;
  onToast?: (toast: { type: 'success' | 'error' | 'warning' | 'info'; title: string; message: string }) => void;
}

export function ExpressGovernance({ orders, onRefresh, onToast }: ExpressGovernanceProps) {
  // 1. Capacity Cap State (Persisted in localStorage, default = 8)
  const [slotCap, setSlotCap] = useState<number>(EXPRESS_DAILY_SLOT_CAP);
  const [capInput, setCapInput] = useState<string>(String(EXPRESS_DAILY_SLOT_CAP));
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    try {
      const savedCap = localStorage.getItem('f11_express_daily_cap');
      if (savedCap) {
        const parsed = parseInt(savedCap, 10);
        if (!isNaN(parsed) && parsed > 0) {
          setSlotCap(parsed);
          setCapInput(String(parsed));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSaveCap = () => {
    const parsed = parseInt(capInput, 10);
    if (isNaN(parsed) || parsed < 1) {
      if (onToast) onToast({ type: 'error', title: 'Invalid Slot Cap', message: 'Daily Express slot cap must be at least 1 order per day.' });
      return;
    }
    setSlotCap(parsed);
    try {
      localStorage.setItem('f11_express_daily_cap', String(parsed));
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
      if (onToast) onToast({ type: 'success', title: 'Express Cap Saved', message: `Daily Express capacity limit updated to ${parsed} orders/day.` });
    } catch {
      // ignore
    }
  };

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
  const missedSLAOrders = expressOrders.filter((o) => o.express_auto_refunded || o.events?.some((e) => (e.status as string) === 'express_auto_refund' || (e.note || '').includes('AUTOMATIC REFUND')));
  const totalRefundAmount = missedSLAOrders.reduce((acc, o) => acc + (Number(o.express_refund_amount) || 15.0), 0);
  const onTimeCount = deliveredExpress.length - missedSLAOrders.length;
  const onTimePct = deliveredExpress.length > 0 ? ((Math.max(0, onTimeCount) / deliveredExpress.length) * 100).toFixed(1) : '100.0';

  // Simulator state
  const [simOrderId, setSimOrderId] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState(false);

  const handleSimulateLateDelivery = async () => {
    if (!simOrderId) {
      if (onToast) onToast({ type: 'error', title: 'Order Required', message: 'Select or enter an Express order ID to simulate.' });
      return;
    }
    setIsSimulating(true);
    try {
      // Advance to delivered with mock 10:18 AM timestamp
      const res = await fetch('/api/mission-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance_stage',
          order_id: simOrderId,
          new_stage: 'delivered',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to simulate');

      if (onToast) {
        onToast({
          type: 'warning',
          title: '⚡ Express SLA Miss Triggered',
          message: 'Delivery recorded past 10:00 AM window. Express fee auto-refunded to card & customer notified.',
        });
      }
      if (onRefresh) onRefresh();
    } catch (err: unknown) {
      if (onToast) onToast({ type: 'error', title: 'Simulation Error', message: (err as Error).message });
    } finally {
      setIsSimulating(false);
    }
  };

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

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                min="1"
                max="50"
                value={capInput}
                onChange={(e) => setCapInput(e.target.value)}
                style={{
                  width: '60px',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: '#1e293b',
                  border: '1px solid rgba(201,161,74,0.5)',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
              <Button variant="primary" size="sm" onClick={handleSaveCap}>
                {isSaved ? '✓ Saved' : 'Update Cap'}
              </Button>
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
              {missedSLAOrders.length} <span style={{ fontSize: '12px', color: '#cbd5e1' }}>(${totalRefundAmount.toFixed(2)})</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Auto-Refund SLA Guarantee Explainer & Test Trigger */}
      <Card variant="bordered" padding="lg" style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ maxWidth: '740px' }}>
            <h3 style={{ fontSize: '15px', color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
              <span style={{ fontSize: '18px' }}>🛡️</span> 10:00 AM Delivery Window Guarantee Logic
            </h3>
            <p style={{ fontSize: '13px', color: '#e2e8f0', marginTop: '6px', margin: '6px 0 0', lineHeight: '1.6' }}>
              If an Express order is marked delivered after 10:00 AM on the promised delivery date, the system automatically:
            </p>
            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#e2e8f0', lineHeight: '1.5' }}>
              <div>
                <strong style={{ color: 'var(--color-gold)' }}>1.</strong> Refunds the Express surcharge (<span style={{ color: 'var(--color-gold)', fontWeight: 'bold' }}>$15 min / +50%</span>) to the customer&apos;s payment card.
              </div>
              <div>
                <strong style={{ color: 'var(--color-gold)' }}>2.</strong> Dispatches exact customer SMS: <em style={{ color: '#ffffff', background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px' }}>&ldquo;Your Express delivery ran past our window. The Express fee has been refunded automatically — that&apos;s our guarantee.&rdquo;</em>
              </div>
              <div>
                <strong style={{ color: 'var(--color-gold)' }}>3.</strong> Logs the refund as an Express SLA miss in Mission Control.
              </div>
            </div>
          </div>

          {/* Test Simulator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <select
              value={simOrderId}
              onChange={(e) => setSimOrderId(e.target.value)}
              style={{
                padding: '7px 10px',
                borderRadius: '6px',
                background: '#1e293b',
                border: '1px solid rgba(255,255,255,0.25)',
                color: '#ffffff',
                fontSize: '12px',
                outline: 'none',
              }}
            >
              <option value="" style={{ background: '#1e293b', color: '#cbd5e1' }}>Select Express Order to Test...</option>
              {expressOrders.map((o) => (
                <option key={o.id} value={o.id} style={{ background: '#1e293b', color: '#ffffff' }}>
                  #{o.order_number || o.id.slice(0, 8)} ({o.customer?.full_name || 'Customer'}) - {o.status}
                </option>
              ))}
            </select>
            <Button
              variant="outlineGold"
              size="sm"
              onClick={handleSimulateLateDelivery}
              disabled={isSimulating || !simOrderId}
              style={{
                color: !simOrderId ? 'rgba(255, 255, 255, 0.75)' : 'var(--color-gold)',
                borderColor: !simOrderId ? 'rgba(255, 255, 255, 0.25)' : 'var(--color-gold)',
                background: !simOrderId ? 'rgba(255, 255, 255, 0.05)' : 'rgba(201, 161, 74, 0.12)',
                fontWeight: 600,
              }}
            >
              {isSimulating ? 'Processing...' : '⚡ Test SLA Miss Simulator'}
            </Button>
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
