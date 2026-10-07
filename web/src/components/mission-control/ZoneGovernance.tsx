'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Button } from '@/components/ui';
import { ALL_ROUTE_DAYS, ZONE_CONFIG, COVERAGE_HUB, type RouteDayName, type MetroZoneId } from '@/lib/constants';
import { METRO_ZONE_IDS, type CoverageSettings } from '@/lib/coverage';
import { useUIStore } from '@/stores/ui-store';
import { ExtendedReachPanel } from './ExtendedReachPanel';

/**
 * Coverage settings (client 2026-10-07, request 8): zone minimums, route days and distance
 * bands, Zone 5 fees, minimum, Routine discount, thresholds and cadence, and the 24-Hour
 * Express switch. Saved to the database (/api/mission-control/coverage) and used by booking
 * within a minute. City and ZIP lists stay in code.
 */
const panel = { background: '#0d1527', borderColor: '#1e293b' } as const;
const label = { fontSize: '12px', color: '#cbd5e1', display: 'block', marginBottom: '4px', fontWeight: 600 } as const;
const input = {
  width: '100%',
  minHeight: '36px',
  padding: '6px 10px',
  background: '#070b14',
  border: '1px solid #334155',
  borderRadius: '6px',
  color: '#f8fafc',
  fontSize: '13px',
} as const;
const help = { fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' } as const;

function NumberField({ id, text, value, onChange, step = 1, hint }: { id: string; text: string; value: number; onChange: (v: number) => void; step?: number; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} style={label}>{text}</label>
      <input id={id} type="number" min={0} step={step} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(Number(e.target.value))} style={input} />
      {hint && <p style={help}>{hint}</p>}
    </div>
  );
}

function DayPicker({ idPrefix, days, onChange }: { idPrefix: string; days: RouteDayName[]; onChange: (d: RouteDayName[]) => void }) {
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
      <legend style={label}>Route days</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {ALL_ROUTE_DAYS.map((day) => {
          const id = `${idPrefix}-${day}`;
          const checked = days.includes(day);
          return (
            <label key={day} htmlFor={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#e2e8f0', minHeight: '32px' }}>
              <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? days.filter((d) => d !== day) : ALL_ROUTE_DAYS.filter((d) => d === day || days.includes(d)))}
              />
              {day.slice(0, 3)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ZoneGovernance() {
  const addToast = useUIStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['coverage-settings'],
    queryFn: async (): Promise<{ settings: CoverageSettings; defaults: CoverageSettings }> => {
      const res = await fetch('/api/mission-control/coverage');
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not load the coverage settings');
      return res.json();
    },
  });
  // The form edits a copy; null until the first change (then it holds the whole draft)
  const [draft, setDraft] = useState<CoverageSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const settings = draft ?? data?.settings ?? null;

  const update = (fn: (s: CoverageSettings) => CoverageSettings) => {
    if (settings) setDraft(fn(structuredClone(settings)));
  };
  const setZone = (id: MetroZoneId, patch: Partial<CoverageSettings['zones'][MetroZoneId]>) =>
    update((s) => ({ ...s, zones: { ...s.zones, [id]: { ...s.zones[id], ...patch } } }));
  const setReach = (patch: Partial<CoverageSettings['extendedReach']>) => update((s) => ({ ...s, extendedReach: { ...s.extendedReach, ...patch } }));
  const setBand = (i: number, patch: Partial<CoverageSettings['extendedReach']['bands'][number]>) =>
    update((s) => ({ ...s, extendedReach: { ...s.extendedReach, bands: s.extendedReach.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) } }));

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch('/api/mission-control/coverage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not save');
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['coverage-settings'] });
      await queryClient.invalidateQueries({ queryKey: ['coverage'] });
      addToast({ type: 'success', title: 'Coverage saved', message: 'Bookings use the new settings within a minute.' });
    } catch (err) {
      addToast({ type: 'error', title: 'Not saved', message: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <p style={{ color: '#cbd5e1' }}>Loading coverage settings…</p>;
  if (error || !settings) return <p style={{ color: '#fca5a5' }}>{(error as Error)?.message || 'Could not load the coverage settings.'}</p>;
  const reach = settings.extendedReach;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        style={{
          background: 'linear-gradient(135deg, #0b1f14 0%, #132f1f 100%)',
          border: '1px solid rgba(212, 160, 23, 0.4)',
          borderRadius: 'var(--radius-xl)',
          padding: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '24px' }} aria-hidden="true">🗺️</span>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#fef08a', margin: 0 }}>Coverage, Zones &amp; Express</h2>
            <Badge variant="gold">Saved settings</Badge>
          </div>
          <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0, maxWidth: '780px', lineHeight: 1.5 }}>
            Zones 1–4 follow their ZIP lists; any other address is placed by driving distance from {COVERAGE_HUB.name} ({COVERAGE_HUB.address}). Changes apply to new bookings within a minute; booked orders keep their price.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {draft && <span style={{ fontSize: '12px', color: '#fde68a' }}>Unsaved changes</span>}
          <Button variant="outlineLight" size="sm" onClick={() => setDraft(null)} disabled={!draft || saving}>Discard</Button>
          <Button variant="primary" size="sm" onClick={save} disabled={!draft || saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </div>

      {/* 24-Hour Express switch (client 8E: off until the plant confirms in writing) */}
      <Card variant="bordered" padding="lg" style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: 0 }}>⚡ 24-Hour Express (Mon–Thu)</h3>
            <p style={help}>Keep off until the plant confirms the schedule in writing. When on, Express shows in the zones marked below.</p>
          </div>
          <label htmlFor="express-switch" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#f8fafc', fontWeight: 700, minHeight: '44px' }}>
            <input id="express-switch" type="checkbox" checked={settings.expressEnabled} onChange={(e) => update((s) => ({ ...s, expressEnabled: e.target.checked }))} />
            {settings.expressEnabled ? 'On' : 'Off'}
          </label>
        </div>
      </Card>

      {/* Zones 1-4 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {METRO_ZONE_IDS.map((id) => {
          const zone = settings.zones[id];
          const base = ZONE_CONFIG[id];
          return (
            <Card key={id} variant="bordered" padding="lg" style={{ ...panel, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: 0 }}>{base.name}</h3>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{base.cities.join(', ')}</span>
              </div>
              <NumberField id={`${id}-min`} text="Order minimum ($)" value={zone.minimumOrder} onChange={(v) => setZone(id, { minimumOrder: v })} />
              <DayPicker idPrefix={id} days={zone.routeDays} onChange={(d) => setZone(id, { routeDays: d })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <NumberField id={`${id}-from`} text="Distance from (mi)" value={zone.minMiles} onChange={(v) => setZone(id, { minMiles: v })} />
                <NumberField id={`${id}-to`} text="Distance to (mi)" value={zone.maxMiles} onChange={(v) => setZone(id, { maxMiles: v })} />
              </div>
              <label htmlFor={`${id}-express`} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#e2e8f0', minHeight: '32px' }}>
                <input id={`${id}-express`} type="checkbox" checked={zone.expressEligible} onChange={(e) => setZone(id, { expressEligible: e.target.checked })} />
                Offer Express here (while the switch is on)
              </label>
              <p style={help}>{base.zipCodes.length} ZIP codes on this zone&apos;s list.</p>
            </Card>
          );
        })}
      </div>

      {/* Zone 5 */}
      <Card variant="bordered" padding="lg" style={{ ...panel, display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: 0 }}>Zone 5 — Extended Reach</h3>
          <p style={help}>Beyond the Metroplex. Fee by driving distance; the route runs once enough neighbors book. Beyond the last band, the waitlist.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <NumberField id="z5-min" text="Order minimum ($)" value={reach.minimumOrder} onChange={(v) => setReach({ minimumOrder: v })} hint="The delivery fee is on top." />
          <NumberField id="z5-routine" text="Routine discount on the fee (%)" value={reach.routineDiscountPercent} onChange={(v) => setReach({ routineDiscountPercent: v })} />
          <NumberField id="z5-waitlist" text="Waitlist beyond (mi)" value={reach.waitlistBeyondMiles} onChange={(v) => setReach({ waitlistBeyondMiles: v })} />
          <NumberField id="z5-cadence" text="Every N weeks" value={reach.cadenceWeeks} onChange={(v) => setReach({ cadenceWeeks: v })} />
          <div>
            <label htmlFor="z5-day" style={label}>Route day</label>
            <select id="z5-day" value={reach.routeDay} onChange={(e) => setReach({ routeDay: e.target.value as RouteDayName })} style={input}>
              {ALL_ROUTE_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="z5-first" style={label}>First run date</label>
            <input id="z5-first" type="date" value={reach.firstRunDate} onChange={(e) => setReach({ firstRunDate: e.target.value })} style={input} />
            <p style={help}>Later runs follow every {reach.cadenceWeeks} week(s).</p>
          </div>
          <NumberField id="z5-notice" text="Booking closes (days before)" value={reach.bookingNoticeDays} onChange={(v) => setReach({ bookingNoticeDays: v })} hint="At least 3: the run is decided 2 days before." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
          {reach.bands.map((band, i) => (
            <div key={band.id} style={{ border: '1px solid #1e293b', borderRadius: '8px', padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <strong style={{ gridColumn: '1 / -1', color: '#fef08a', fontSize: '13px' }}>Band {band.id}</strong>
              <NumberField id={`band-${band.id}-from`} text="From (mi)" value={band.minMiles} onChange={(v) => setBand(i, { minMiles: v })} />
              <NumberField id={`band-${band.id}-to`} text="To (mi)" value={band.maxMiles} onChange={(v) => setBand(i, { maxMiles: v })} />
              <NumberField id={`band-${band.id}-fee`} text="Delivery fee ($)" value={band.fee} step={0.01} onChange={(v) => setBand(i, { fee: v })} />
              <NumberField id={`band-${band.id}-threshold`} text="Runs at (bookings)" value={band.dispatchThreshold} onChange={(v) => setBand(i, { dispatchThreshold: v })} />
            </div>
          ))}
        </div>
      </Card>

      <ExtendedReachPanel />
    </div>
  );
}
