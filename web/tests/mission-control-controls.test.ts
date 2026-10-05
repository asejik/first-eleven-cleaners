import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPRESS_DAILY_SLOT_CAP } from '@/lib/constants';
import { GET as slotsGET } from '@/app/api/slots/route';

// ---------------------------------------------------------------------------
// PR-09: Mission Control must not offer controls that act on real orders for
// testing, or "save" settings the booking server never uses.
// ---------------------------------------------------------------------------
const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Mission Control controls are real (PR-09)', () => {
  it('Express screen has no late-delivery simulator and no browser-only cap', () => {
    const express = src('src/components/mission-control/ExpressGovernance.tsx');
    expect(express).not.toContain('advance_stage');
    expect(express).not.toContain('localStorage');
    expect(express).not.toMatch(/Simulator/i);
  });

  it('Zone screen shows the enforced rules without edit or save controls', () => {
    const zones = src('src/components/mission-control/ZoneGovernance.tsx');
    expect(zones).not.toContain('<input');
    expect(zones).not.toMatch(/Save .*Rules/);
    expect(zones).not.toMatch(/Tier-Down/);
    expect(zones).not.toContain('stops30Days');
  });

  it('booking enforces the shared Express cap constant', () => {
    const bookings = src('src/app/api/bookings/route.ts');
    expect(bookings).toContain('>= EXPRESS_DAILY_SLOT_CAP');
    expect(bookings).not.toMatch(/bookedInExpress \?\? 0\) >= 8\b/);
  });

  it('the slots API reports the enforced cap, not one chosen in the URL', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const res = await slotsGET(new Request('http://localhost/api/slots?date=2026-10-06&express_cap=50'));
    const body = await res.json();
    expect(body.express_capacity).toBe(EXPRESS_DAILY_SLOT_CAP);
  });

  it('the ops dashboard no longer reports an invented labor percentage', () => {
    const route = src('src/app/api/mission-control/route.ts');
    expect(route).not.toContain('baseLaborRate');
    expect(route).not.toMatch(/labor:/);
  });
});
