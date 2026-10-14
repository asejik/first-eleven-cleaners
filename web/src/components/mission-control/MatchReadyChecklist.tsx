'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import { prepareImageForUpload } from '@/lib/image-upload';
import { MATCH_READY_ITEMS, FOUND_NOTE, photoLabel, type MatchReadyPhase, type MatchReadySummary } from '@/lib/match-ready';

/**
 * The Match-Ready Check at the Intake Station (client 2026-10-14). Items 1-5 when the bag
 * comes in; items 6-10 and the return photo when it's back from the plant, then "Send Out for
 * Delivery" (locked until the check is finished). Item 11 is the driver's, at the door.
 */
interface CheckView {
  order: { id: string; status: string; plant_ticket_number: string | null; match_ready_override_reason: string | null } | null;
  checks: Array<{ item: number; note: string | null; done_by: string | null }>;
  photos: Array<{ id?: string; photo_type: string; photo_url: string }>;
  summary: MatchReadySummary | null;
}

type PhotoType = 'pocket_item' | 'stain' | 'return';

const box = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '14px', display: 'grid', gap: '10px' } as const;
const row = { display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '13px', color: '#e2e8f0' } as const;
const small = { fontSize: '12px', color: '#94a3b8', margin: 0 } as const;
const input = { background: '#0b1220', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', padding: '6px 8px', fontSize: '13px' } as const;

export function MatchReadyChecklist({ orderId, phase }: { orderId: string; phase: Exclude<MatchReadyPhase, 'door'> }) {
  const addToast = useUIStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const queryKey = ['match-ready', orderId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<CheckView> => {
      const res = await fetch(`/api/orders/${orderId}/match-ready`);
      if (!res.ok) throw new Error('Could not load the Match-Ready Check');
      return res.json();
    },
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);

  const post = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    try {
      const res = await fetch(`/api/orders/${orderId}/match-ready`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Not saved');
      queryClient.setQueryData(queryKey, result);
      return true;
    } catch (err) {
      addToast({ type: 'error', title: 'Not saved', message: (err as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const addPhoto = async (type: PhotoType, file: File | undefined) => {
    if (!file) return false;
    setBusy(`photo:${type}`);
    try {
      const formData = new FormData();
      formData.append('file', await prepareImageForUpload(file));
      formData.append('order_id', orderId);
      formData.append('photo_type', type);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploaded = await res.json().catch(() => ({}));
      if (!res.ok || !uploaded.url) throw new Error(uploaded.error || 'The photo could not be uploaded. Please try again.');
      return await post({ photo: { type, url: uploaded.url } }, `photo:${type}`);
    } catch (err) {
      addToast({ type: 'error', title: 'Photo not saved', message: (err as Error).message });
      setBusy(null);
      return false;
    }
  };

  const advance = async (newStage: 'match_ready_check' | 'out_for_delivery') => {
    setBusy(newStage);
    try {
      const res = await fetch('/api/mission-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'advance_stage', order_id: orderId, new_stage: newStage }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Not moved');
      addToast({ type: 'success', title: newStage === 'out_for_delivery' ? 'Out for Delivery' : 'Match-Ready Check started' });
      await Promise.all([queryClient.invalidateQueries({ queryKey }), queryClient.invalidateQueries({ queryKey: ['intake_queue'] })]);
    } catch (err) {
      addToast({ type: 'error', title: 'Not moved', message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <div style={box}><p style={small}>Loading the Match-Ready Check…</p></div>;
  if (!data?.order || !data.summary) return <div style={box}><p style={small}>The Match-Ready Check needs the database connected.</p></div>;

  const { order, summary } = data;
  const done = (n: number) => data.checks.find((c) => c.item === n);
  const hasPhoto = (type: string) => data.photos.some((p) => p.photo_type === type);
  const shown = MATCH_READY_ITEMS.filter((i) => (phase === 'intake' ? i.phase === 'intake' : i.phase !== 'door'));
  const atPlant = order.status === 'in_cleaning';
  const inCheck = order.status === 'match_ready_check';
  const intakeExempt = summary.exempt;

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <strong style={{ color: '#ffffff', fontSize: '15px' }}>🛡️ Match-Ready Check {phase === 'intake' ? '(items 1-5)' : '(items 1-10)'}</strong>
        <span style={small}>
          {summary.ready ? 'Ready to go out' : `${summary.missing.length ? `To do: ${summary.missing.join(', ')}` : ''}${!summary.returnPhoto && phase === 'return' ? `${summary.missing.length ? '; ' : ''}return photo` : ''}`}
        </span>
      </div>

      <label style={{ ...row, alignItems: 'center' }}>
        <span style={{ minWidth: '110px', color: '#cbd5e1' }}>Plant ticket #</span>
        <input
          aria-label="Plant ticket number"
          value={ticket ?? order.plant_ticket_number ?? ''}
          onChange={(e) => setTicket(e.target.value)}
          maxLength={40}
          style={{ ...input, width: '160px' }}
        />
        {ticket !== null && ticket !== (order.plant_ticket_number ?? '') && (
          <Button variant="outlineGold" size="sm" disabled={busy === 'ticket'} onClick={async () => (await post({ plant_ticket_number: ticket.trim() || null }, 'ticket')) && setTicket(null)}>
            Save
          </Button>
        )}
      </label>

      {phase === 'return' && atPlant && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <p style={{ ...small, flex: 1 }}>This order is at the plant. When it comes back, start its check.</p>
          <Button variant="primary" size="sm" disabled={busy === 'match_ready_check'} onClick={() => advance('match_ready_check')}>
            Back from the plant: start the check
          </Button>
        </div>
      )}

      {intakeExempt && phase === 'intake' ? (
        <p style={small}>This order was weighed before the Match-Ready Check began, so items 1-5 aren&apos;t needed.</p>
      ) : (
        shown.map((def) => {
          if (intakeExempt && def.phase === 'intake') return null;
          const check = done(def.item);
          const locked = def.phase === 'return' && !inCheck;
          const key = `item:${def.item}`;
          const askFound = def.photo?.when === 'if_found';
          const photoType = def.photo?.type as PhotoType | undefined;
          return (
            <div key={def.item} style={{ ...row, opacity: locked ? 0.55 : 1 }}>
              <input
                type="checkbox"
                aria-label={`Item ${def.item}`}
                checked={Boolean(check)}
                disabled={locked || busy === key || (askFound && !check)}
                onChange={(e) => post({ item: def.item, ticked: e.target.checked }, key)}
                style={{ marginTop: '3px' }}
              />
              <div style={{ flex: 1, display: 'grid', gap: '6px' }}>
                <span>
                  {def.item}. {def.label}
                  {check?.note === FOUND_NOTE && ' (found, photographed)'}
                </span>
                {askFound && !check && !locked && photoType && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={small}>{def.photo?.ask}</span>
                    <Button variant="outlineLight" size="sm" disabled={busy === key} onClick={() => post({ item: def.item, ticked: true, found: false }, key)}>
                      No
                    </Button>
                    <label style={{ ...small, color: '#fde68a', cursor: 'pointer' }}>
                      Yes: take a photo
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (await addPhoto(photoType, file)) await post({ item: def.item, ticked: true, found: true }, key);
                        }}
                      />
                    </label>
                  </div>
                )}
                {def.photo?.type === 'return' && !locked && (
                  <label style={{ ...small, color: hasPhoto('return') ? '#86efac' : '#fde68a', cursor: 'pointer' }}>
                    {hasPhoto('return') ? '✓ Return photo attached (add another)' : 'Take the return photo (required)'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        await addPhoto('return', file);
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })
      )}

      {data.photos.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {data.photos.map((p) => (
            <figure key={p.id || p.photo_url} style={{ margin: 0, width: '84px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.photo_url} alt={photoLabel(p.photo_type)} style={{ width: '84px', height: '84px', objectFit: 'cover', borderRadius: '6px' }} />
              <figcaption style={{ ...small, fontSize: '11px' }}>{photoLabel(p.photo_type)}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {phase === 'return' && inCheck && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
          <p style={{ ...small, flex: 1 }}>
            {summary.ready
              ? 'Items 1-10 are done and the return photo is attached.'
              : order.match_ready_override_reason
                ? `The owner overrode the check: ${order.match_ready_override_reason}`
                : 'Locked until items 1-10 are ticked and the return photo is attached. The owner can override it from Mission Control.'}
          </p>
          <Button
            variant="primary"
            size="sm"
            disabled={(!summary.ready && !order.match_ready_override_reason) || busy === 'out_for_delivery'}
            onClick={() => advance('out_for_delivery')}
          >
            Send Out for Delivery
          </Button>
        </div>
      )}
    </div>
  );
}
