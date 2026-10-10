'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';

/**
 * Territories (client 2026-10-10): named ZIP groups, each with its Founding 111 counter.
 * Rename a territory, add one, or move a ZIP; Zone 1-4 ZIPs in no territory are listed.
 */
interface TerritoryRow {
  id: string;
  name: string;
  zone_id: string;
  zips: string[];
  founders: number;
  activeFounders: number;
}
interface TerritoryView {
  limit: number;
  territories: TerritoryRow[];
  unassigned: { zip: string; zone: string }[];
}

const input = { background: '#0b1220', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', padding: '6px 8px', fontSize: '13px' } as const;

export function TerritoriesPanel() {
  const addToast = useUIStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['territories'],
    queryFn: async (): Promise<TerritoryView> => {
      const res = await fetch('/api/mission-control/territories');
      if (!res.ok) throw new Error('Could not load territories');
      return res.json();
    },
  });
  const [zip, setZip] = useState('');
  const [target, setTarget] = useState('');
  const [newTerritory, setNewTerritory] = useState({ id: '', name: '', zone_id: 'zone_1' });
  const [busy, setBusy] = useState(false);

  const act = async (body: Record<string, string>, done: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/mission-control/territories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Not saved');
      addToast({ type: 'success', title: done });
      await queryClient.invalidateQueries({ queryKey: ['territories'] });
      return true;
    } catch (err) {
      addToast({ type: 'error', title: 'Not saved', message: (err as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rename = (t: TerritoryRow) => {
    const name = window.prompt(`New name for territory ${t.id}`, t.name);
    if (name && name.trim() && name !== t.name) void act({ action: 'rename', id: t.id, name: name.trim() }, 'Territory renamed');
  };

  return (
    <Card variant="bordered" padding="lg" style={{ background: '#0d1527', borderColor: '#1e293b' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: '0 0 4px' }}>🗺️ Territories & Founding 111</h3>
      <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px' }}>
        Each ZIP belongs to one territory. The first {data?.limit ?? 111} Routine members in a territory are its Founding members.
      </p>
      {isLoading || !data ? (
        <p style={{ color: '#cbd5e1' }}>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: '#e2e8f0' }}>
              <thead>
                <tr style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Territory</th>
                  <th style={{ padding: '6px 8px' }}>Zone</th>
                  <th style={{ padding: '6px 8px' }}>Founders</th>
                  <th style={{ padding: '6px 8px' }}>ZIPs</th>
                </tr>
              </thead>
              <tbody>
                {data.territories.map((t) => (
                  <tr key={t.id} style={{ borderTop: '1px solid #1e293b', verticalAlign: 'top' }}>
                    <td style={{ padding: '6px 8px' }}>
                      <strong>{t.id}</strong> {t.name}{' '}
                      <button type="button" onClick={() => rename(t)} style={{ background: 'none', border: 'none', color: '#C9A14A', cursor: 'pointer', fontSize: '12px' }}>
                        rename
                      </button>
                    </td>
                    <td style={{ padding: '6px 8px' }}>{t.zone_id.replace('zone_', 'Zone ')}</td>
                    <td style={{ padding: '6px 8px' }}>
                      {t.founders} of {data.limit}
                      {t.founders !== t.activeFounders ? ` (${t.activeFounders} active)` : ''}
                    </td>
                    <td style={{ padding: '6px 8px', color: '#94a3b8', fontSize: '12px' }}>{t.zips.join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.unassigned.length > 0 && (
            <p style={{ fontSize: '12px', color: '#fde68a', margin: 0 }}>
              In no territory yet (their members can&apos;t become founders): {data.unassigned.map((u) => `${u.zip} (${u.zone.replace('zone_', 'Zone ')})`).join(', ')}
            </p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Move ZIP</span>
            <input aria-label="ZIP code" value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="75209" style={{ ...input, width: '80px' }} />
            <span style={{ fontSize: '12px', color: '#cbd5e1' }}>to</span>
            <select aria-label="Territory" value={target} onChange={(e) => setTarget(e.target.value)} style={input}>
              <option value="">Choose a territory</option>
              {data.territories.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} {t.name}
                </option>
              ))}
            </select>
            <Button
              variant="outlineGold"
              size="sm"
              disabled={busy || zip.length !== 5 || !target}
              onClick={async () => {
                if (await act({ action: 'assign_zip', zip, territory_id: target }, `${zip} moved`)) setZip('');
              }}
            >
              Move
            </Button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#cbd5e1' }}>New territory</span>
            <input aria-label="Territory code" value={newTerritory.id} onChange={(e) => setNewTerritory({ ...newTerritory, id: e.target.value })} placeholder="1I" style={{ ...input, width: '60px' }} />
            <input aria-label="Territory name" value={newTerritory.name} onChange={(e) => setNewTerritory({ ...newTerritory, name: e.target.value })} placeholder="Name" style={{ ...input, width: '200px' }} />
            <select aria-label="Zone" value={newTerritory.zone_id} onChange={(e) => setNewTerritory({ ...newTerritory, zone_id: e.target.value })} style={input}>
              {[1, 2, 3, 4, 5].map((z) => (
                <option key={z} value={`zone_${z}`}>
                  Zone {z}
                </option>
              ))}
            </select>
            <Button
              variant="outlineGold"
              size="sm"
              disabled={busy || !newTerritory.id.trim() || newTerritory.name.trim().length < 2}
              onClick={async () => {
                if (await act({ action: 'create', ...newTerritory }, 'Territory added')) setNewTerritory({ id: '', name: '', zone_id: 'zone_1' });
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
