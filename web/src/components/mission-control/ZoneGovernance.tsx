'use client';

import { useState } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { ZONE_CONFIG, type ZoneConfig } from '@/lib/constants';
import type { Order } from '@/types';

interface ZoneGovernanceProps {
  orders?: Order[];
  onToast?: (toast: { type: 'success' | 'error' | 'warning' | 'info'; title: string; message: string }) => void;
}

interface DynamicZoneMetrics {
  stops30Days: number;
  avgStopsPerDay: number;
  eligibleForTierDown: boolean;
  activeTierDown: boolean;
  originalMinimum: number;
}

export function ZoneGovernance({ orders: _orders = [], onToast }: ZoneGovernanceProps) {
  // Working state for the 4 zones
  const [zones, setZones] = useState<Record<string, ZoneConfig>>(() => ({ ...ZONE_CONFIG }));
  const [expandedZipZone, setExpandedZipZone] = useState<string | null>(null);

  // Dynamic minimums state & metrics
  const [metrics, setMetrics] = useState<Record<string, DynamicZoneMetrics>>({
    zone_1: { stops30Days: 142, avgStopsPerDay: 5.5, eligibleForTierDown: false, activeTierDown: false, originalMinimum: 45 },
    zone_2: { stops30Days: 198, avgStopsPerDay: 7.6, eligibleForTierDown: true, activeTierDown: false, originalMinimum: 60 },
    zone_3: { stops30Days: 174, avgStopsPerDay: 6.7, eligibleForTierDown: true, activeTierDown: false, originalMinimum: 80 },
    zone_4: { stops30Days: 48, avgStopsPerDay: 1.8, eligibleForTierDown: false, activeTierDown: false, originalMinimum: 100 },
  });

  const handleMinimumChange = (zoneId: string, val: number) => {
    setZones((prev) => ({
      ...prev,
      [zoneId]: {
        ...prev[zoneId],
        minimumOrder: Math.max(15, val),
      },
    }));
  };

  const handleToggleExpress = (zoneId: string) => {
    setZones((prev) => {
      const current = prev[zoneId];
      const nextEligible = !current.expressEligible;
      return {
        ...prev,
        [zoneId]: {
          ...current,
          expressEligible: nextEligible,
          expressLabel: nextEligible ? '⚡ 24-Hour Express Eligible' : '⏱ Standard 48-Hour (Express Unavailable)',
        },
      };
    });
    onToast?.({
      type: 'info',
      title: 'Zone Express Status Updated',
      message: `${zones[zoneId].name} Express eligibility changed.`,
    });
  };

  const handleSaveZone = (zoneId: string) => {
    onToast?.({
      type: 'success',
      title: 'Zone Policy Saved',
      message: `${zones[zoneId].name}: Minimum $${zones[zoneId].minimumOrder.toFixed(0)} and route rules updated.`,
    });
  };

  const handleTriggerTierDown = (zoneId: string) => {
    const currentMetric = metrics[zoneId];
    if (currentMetric.activeTierDown) {
      // Revert tier down
      setMetrics((prev) => ({
        ...prev,
        [zoneId]: { ...prev[zoneId], activeTierDown: false },
      }));
      setZones((prev) => ({
        ...prev,
        [zoneId]: { ...prev[zoneId], minimumOrder: currentMetric.originalMinimum },
      }));
      onToast?.({
        type: 'info',
        title: 'Tier-Down Restored',
        message: `${zones[zoneId].name} minimum restored to published standard $${currentMetric.originalMinimum}.`,
      });
    } else {
      // Apply tier down (-$15 reduction due to high density)
      const reducedMin = Math.max(35, currentMetric.originalMinimum - 15);
      setMetrics((prev) => ({
        ...prev,
        [zoneId]: { ...prev[zoneId], activeTierDown: true },
      }));
      setZones((prev) => ({
        ...prev,
        [zoneId]: { ...prev[zoneId], minimumOrder: reducedMin },
      }));
      onToast?.({
        type: 'success',
        title: 'Dynamic Tier-Down Activated!',
        message: `${zones[zoneId].name} route density (6+ stops/day) verified. Minimum dynamically lowered to $${reducedMin}.`,
      });
    }
  };

  return (
    <div>
      {/* Top Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0b1f14 0%, #132f1f 100%)',
          border: '1px solid rgba(212, 160, 23, 0.4)',
          borderRadius: 'var(--radius-xl)',
          padding: '24px',
          marginBottom: '28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontSize: '24px' }}>🗺️</span>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#fef08a', margin: 0 }}>
              Smart Coverage &amp; Zone Minimums Governance
            </h2>
            <Badge variant="gold">Zone-Scale Logistics</Badge>
          </div>
          <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0, maxWidth: '780px', lineHeight: 1.5 }}>
            Door-to-door delivery stays 100% complimentary across North Texas. Order minimums scale fairly by zone to cover transit economics, with automated route-day gating and Express protection.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <Button
            variant="outline"
            size="sm"
            aria-label="Reset Defaults to Factory Settings"
            onClick={() => {
              setZones({ ...ZONE_CONFIG });
              onToast?.({ type: 'info', title: 'Reset to Factory Defaults', message: 'Zone settings restored.' });
            }}
            style={{ borderColor: 'rgba(255, 255, 255, 0.3)', color: '#f8fafc' }}
          >
            ↺ Reset Defaults
          </Button>
        </div>
      </div>

      {/* Dynamic Minimums Volume Tracker Panel */}
      <div
        style={{
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 'var(--radius-xl)',
          padding: '20px 24px',
          marginBottom: '28px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📊</span> Dynamic Minimums &amp; Stop Density (Trailing 30 Days)
            </h3>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Routes maintaining 6+ stops/day qualify for manual admin tier-down (lowering minimums to drive repeat customer frequency).
            </span>
          </div>
          <Badge variant="info">Automated Density Telemetry</Badge>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          {Object.entries(zones).map(([zoneId, zone]) => {
            const m = metrics[zoneId];
            return (
              <div
                key={zoneId}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: m.activeTierDown ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '13px', color: '#f8fafc' }}>{zone.name}</strong>
                  {m.activeTierDown ? (
                    <span style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700 }}>
                      TIER-DOWN ACTIVE
                    </span>
                  ) : m.eligibleForTierDown ? (
                    <span style={{ fontSize: '10px', background: 'rgba(212, 160, 23, 0.2)', color: '#fef08a', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700 }}>
                      6+ STOPS/DAY ELIGIBLE
                    </span>
                  ) : (
                    <span style={{ fontSize: '10px', color: '#64748b' }}>Standard Volume</span>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                  <span>30-Day Completed Stops:</span>
                  <strong style={{ color: '#ffffff' }}>{m.stops30Days} stops</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginBottom: '12px' }}>
                  <span>Avg Stop Density:</span>
                  <strong style={{ color: m.avgStopsPerDay >= 6 ? '#34d399' : '#f8fafc' }}>
                    {m.avgStopsPerDay} stops / route day
                  </strong>
                </div>

                {m.eligibleForTierDown ? (
                  <button
                    type="button"
                    onClick={() => handleTriggerTierDown(zoneId)}
                    style={{
                      width: '100%',
                      padding: '7px 12px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: m.activeTierDown ? '#ef4444' : '#10b981',
                      background: m.activeTierDown ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                      color: m.activeTierDown ? '#fca5a5' : '#34d399',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {m.activeTierDown ? `↺ Revert to $${m.originalMinimum}` : `⚡ Trigger -$15 Tier-Down ($${m.originalMinimum - 15})`}
                  </button>
                ) : (
                  <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', padding: '4px 0' }}>
                    Target: 6.0 stops/day to unlock tier-down
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4 Coverage Zones Configuration Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {Object.entries(zones).map(([zoneId, zone]) => {
          const isZipExpanded = expandedZipZone === zoneId;
          return (
            <Card
              key={zoneId}
              variant="bordered"
              padding="lg"
              style={{
                background: '#0d1527',
                borderColor: '#1e293b',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                      {zone.name}
                    </h3>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{zone.tagline}</span>
                  </div>
                  <span
                    style={{
                      background: 'rgba(212, 160, 23, 0.15)',
                      border: '1px solid rgba(212, 160, 23, 0.3)',
                      color: '#fef08a',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '9999px',
                    }}
                  >
                    {zone.badge}
                  </span>
                </div>

                {/* Specs Box */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: 'var(--radius-md)',
                    padding: '14px',
                    marginBottom: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  {/* Minimum Order */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: '13px', color: '#f8fafc', display: 'block' }}>Order Minimum:</strong>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>Scales delivery efficiency</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#ffffff', fontWeight: 700 }}>$</span>
                      <input
                        type="number"
                        min="15"
                        max="250"
                        step="5"
                        value={zone.minimumOrder}
                        onChange={(e) => handleMinimumChange(zoneId, Number(e.target.value))}
                        style={{
                          width: '70px',
                          padding: '6px 8px',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: 'var(--radius-sm)',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '14px',
                          textAlign: 'right',
                        }}
                      />
                    </div>
                  </div>

                  {/* Route Schedule */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: '13px', color: '#f8fafc', display: 'block' }}>Route Days:</strong>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>Client booking calendar gating</span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#fef08a' }}>
                      {zone.routeScheduleLabel}
                    </span>
                  </div>

                  {/* Express Status Toggle */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: '13px', color: '#f8fafc', display: 'block' }}>24-Hour Express:</strong>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {zone.expressEligible ? 'Unlocked for morning pickups' : 'Gated / Not Available'}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Toggle Express 24-Hour eligibility for ${zone.name}`}
                      onClick={() => handleToggleExpress(zoneId)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: zone.expressEligible ? '#10b981' : '#64748b',
                        background: zone.expressEligible ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                        color: zone.expressEligible ? '#34d399' : '#94a3b8',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {zone.expressEligible ? '⚡ Eligible' : '⏱ Gated'}
                    </button>
                  </div>
                </div>

                {/* ZIP Coverage / Cities */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1' }}>
                      🏙️ Key Communities ({zone.cities.length}):
                    </span>
                    {zone.zipCodes.length > 0 && (
                      <button
                        type="button"
                        aria-label={`${isZipExpanded ? 'Hide' : 'View'} ZIP codes for ${zone.name}`}
                        onClick={() => setExpandedZipZone(isZipExpanded ? null : zoneId)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#38bdf8',
                          fontSize: '11px',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        {isZipExpanded ? 'Hide ZIPs' : `View ${zone.zipCodes.length} ZIPs`}
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {zone.cities.slice(0, 6).map((city) => (
                      <span
                        key={city}
                        style={{
                          fontSize: '11px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-sm)',
                          color: '#e2e8f0',
                        }}
                      >
                        📍 {city}
                      </span>
                    ))}
                    {zone.cities.length > 6 && (
                      <span style={{ fontSize: '11px', color: '#94a3b8', alignSelf: 'center' }}>
                        +{zone.cities.length - 6} more
                      </span>
                    )}
                  </div>

                  {/* Expandable ZIP preview */}
                  {isZipExpanded && zone.zipCodes.length > 0 && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '10px',
                        background: '#070b14',
                        border: '1px solid #1e293b',
                        borderRadius: 'var(--radius-sm)',
                        maxHeight: '100px',
                        overflowY: 'auto',
                        fontSize: '11px',
                        color: '#94a3b8',
                        lineHeight: 1.6,
                      }}
                    >
                      {zone.zipCodes.join(', ')}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="primary"
                  size="sm"
                  aria-label={`Save rules for ${zone.name}`}
                  onClick={() => handleSaveZone(zoneId)}
                >
                  Save {zone.badge} Rules
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
