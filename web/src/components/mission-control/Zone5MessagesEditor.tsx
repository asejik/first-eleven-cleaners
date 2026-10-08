'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import {
  ZONE5_MESSAGE_KEYS,
  ZONE5_MESSAGE_INFO,
  ZONE5_PLACEHOLDERS,
  unknownPlaceholders,
  type Zone5Messages,
} from '@/lib/zone5-messages';

/**
 * Zone 5 texts (client 2026-10-08): the six templates, editable, with "Reset to original".
 */
export function Zone5MessagesEditor() {
  const addToast = useUIStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['zone5-messages'],
    queryFn: async (): Promise<{ messages: Zone5Messages; defaults: Zone5Messages }> => {
      const res = await fetch('/api/mission-control/zone5-messages');
      if (!res.ok) throw new Error('Could not load the Zone 5 messages');
      return res.json();
    },
  });
  // The form edits a copy; null until the first change (then it holds all six)
  const [edits, setEdits] = useState<Zone5Messages | null>(null);
  const [saving, setSaving] = useState(false);
  const draft = edits ?? data?.messages ?? null;
  const setDraft = setEdits;

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch('/api/mission-control/zone5-messages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not save');
      addToast({ type: 'success', title: 'Messages saved', message: 'New texts use them within a minute.' });
      await queryClient.invalidateQueries({ queryKey: ['zone5-messages'] });
      setEdits(null);
    } catch (err) {
      addToast({ type: 'error', title: 'Not saved', message: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const changed = Boolean(draft && data && ZONE5_MESSAGE_KEYS.some((key) => draft[key] !== data.messages[key]));
  const hasErrors = Boolean(draft && ZONE5_MESSAGE_KEYS.some((key) => unknownPlaceholders(draft[key]).length > 0));

  return (
    <Card variant="bordered" padding="lg" style={{ background: '#0d1527', borderColor: '#1e293b', gridColumn: '1 / -1' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: '0 0 4px' }}>💬 Zone 5 messages</h3>
      <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px' }}>
        Sent by text to customers who agreed to texts, by email to everyone else. Placeholders:{' '}
        {ZONE5_PLACEHOLDERS.map((p) => `[${p}]`).join(' ')}. [date] is the run (&quot;Oct 21&quot;), [date+7] the next run, [threshold] the pickups the band needs.
      </p>
      {isLoading || !draft || !data ? (
        <p style={{ color: '#cbd5e1' }}>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gap: '14px' }}>
          {ZONE5_MESSAGE_KEYS.map((key) => {
            const unknown = unknownPlaceholders(draft[key]);
            return (
              <div key={key}>
                <label htmlFor={`zone5-msg-${key}`} style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>
                  {ZONE5_MESSAGE_INFO[key].label}
                </label>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 6px' }}>{ZONE5_MESSAGE_INFO[key].when}</p>
                <textarea
                  id={`zone5-msg-${key}`}
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  rows={3}
                  maxLength={480}
                  style={{ width: '100%', background: '#0b1220', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px' }}>
                  <span style={{ color: unknown.length ? '#fca5a5' : '#64748b' }}>
                    {unknown.length ? `Unknown placeholder: ${unknown.map((u) => `[${u}]`).join(', ')}` : `${draft[key].length} characters`}
                  </span>
                  {draft[key] !== data.defaults[key] && (
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, [key]: data.defaults[key] })}
                      style={{ background: 'none', border: 'none', color: '#C9A14A', cursor: 'pointer', fontSize: '12px', padding: 0 }}
                    >
                      Reset to original
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div>
            <Button variant="outlineGold" size="sm" onClick={save} disabled={saving || !changed || hasErrors}>
              {saving ? 'Saving…' : 'Save messages'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
