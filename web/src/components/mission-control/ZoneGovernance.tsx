'use client';

import { useState } from 'react';
import { Card, Badge } from '@/components/ui';
import { ZONE_CONFIG } from '@/lib/constants';

/**
 * Read-only view of the zone rules the booking server enforces (ZONE_CONFIG in
 * src/lib/constants.ts). Changing a minimum, route day or Express eligibility is a code
 * change, so this screen shows the live values instead of offering edits that don't save
 * (P03 PR-09).
 */
export function ZoneGovernance() {
  const zones = ZONE_CONFIG;
  const [expandedZipZone, setExpandedZipZone] = useState<string | null>(null);

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

        <Badge variant="info">Read-only: set in code by your developer</Badge>
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
                    <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '14px' }}>
                      ${zone.minimumOrder.toFixed(2)}
                    </span>
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
                    <span
                      style={{
                        padding: '5px 12px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '11px',
                        fontWeight: 700,
                        border: '1px solid',
                        borderColor: zone.expressEligible ? '#10b981' : '#64748b',
                        background: zone.expressEligible ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                        color: zone.expressEligible ? '#34d399' : '#94a3b8',
                      }}
                    >
                      {zone.expressEligible ? '⚡ Eligible' : '⏱ Gated'}
                    </span>
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

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px', fontSize: '11px', color: '#94a3b8' }}>
                Bookings in this zone use exactly these rules. To change them, ask your developer.
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
