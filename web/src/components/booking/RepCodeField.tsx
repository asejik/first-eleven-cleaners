'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui';

/**
 * The optional "Rep code" box at signup and booking (client 2026-10-14). It checks the code as
 * it's typed; a code we don't recognize is never an error that blocks anything, the booking
 * or signup just goes ahead without it.
 */
export function RepCodeField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const [state, setState] = useState<{ code: string; valid: boolean } | null>(null);

  useEffect(() => {
    const code = value.trim();
    if (!code) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/rep-code?code=${encodeURIComponent(code)}`);
        const result = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setState({ code, valid: Boolean(result.valid) });
      } catch {
        // No answer: say nothing; the server checks the code again anyway
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  const checked = state && state.code === value.trim() ? state : null;
  return (
    <Input
      id={id}
      label="Rep code (optional)"
      placeholder="e.g. 1D-W1-JM"
      value={value}
      autoCapitalize="characters"
      maxLength={20}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
      helperText={
        !value.trim()
          ? 'Met one of our team? Enter the code from their card.'
          : checked?.valid
            ? '✓ Rep code accepted'
            : checked
              ? "We don't recognize that code. Check it, or leave it blank."
              : undefined
      }
    />
  );
}
