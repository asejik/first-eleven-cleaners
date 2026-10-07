import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P05 AR-03: what customers save in Preferences must reach the staff who act on
// it. Drivers get the gate code and delivery instructions; intake gets the care
// preferences (starch, fold/hang, detergent). Each role gets only what it needs.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

const { state } = vi.hoisted(() => ({ state: { selects: [] as string[], rows: [] as Row[] } }));

function builder() {
  const b: Record<string, unknown> = {
    select: (cols?: string) => {
      if (cols) state.selects.push(cols);
      return b;
    },
    eq: () => b,
    in: () => b,
    gte: () => b,
    order: () => b,
    limit: () => b,
    then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: state.rows, error: null, count: 0 }).then(resolve),
  };
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => builder() }) }));
vi.mock('@/lib/supabase/auth-helpers', () => ({
  verifyApiAuth: async () => ({ customer: { id: 'admin-1', full_name: 'Admin', role: 'admin' }, user: { id: 'admin-1' } }),
}));
vi.mock('@/lib/storage', () => ({
  resolveAndUploadPhotoUrl: async (u: string) => u,
  withSignedPhotoUrls: async <T,>(v: T) => v,
}));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification: vi.fn() } }));
vi.mock('@/lib/express', () => ({ handleExpressDeliverySLA: async () => ({ isExpress: false }) }));

import { GET as driverGET } from '@/app/api/driver/route';
import { GET as intakeGET } from '@/app/api/intake/route';
import { staffPreferences } from '@/lib/care-preferences';

const savedPrefs = {
  gate_code: '4417#',
  delivery_instructions: 'Leave with the concierge desk',
  starch_level: 'light',
  fold_vs_hang: 'fold',
  detergent_sensitivity: 'Hypoallergenic only',
};
const order = (status: string, prefs: unknown): Row => ({
  id: 'o1',
  order_number: 'F11-2026-PREF0001',
  status,
  pickup_window: 'morning',
  customer: { id: 'c1', full_name: 'Pat Doe', phone: '+12145550100', preferences: prefs },
  address: { street: '1 Main St', city: 'Dallas', state: 'TX', zip: '75205', delivery_notes: null },
  photos: [],
  events: [],
});

beforeEach(() => {
  state.selects.length = 0;
  state.rows = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Driver manifest shows gate codes and delivery instructions (AR-03)', () => {
  it('a pickup stop carries the customer access notes and nothing else from Preferences', async () => {
    state.rows = [order('booked', [savedPrefs])];
    const body = await (await driverGET(new Request('http://localhost/api/driver'))).json();
    expect(body.pickups[0].customer.preferences).toEqual({
      gate_code: '4417#',
      delivery_instructions: 'Leave with the concierge desk',
    });
    expect(state.selects.join(' ')).toMatch(/customer_preferences\(gate_code, delivery_instructions\)/);
  });

  it('the stop card shows the gate code and instructions', () => {
    const card = src('src/components/driver/DriverStopCard.tsx');
    expect(card).toContain('gate_code');
    expect(card).toContain('delivery_instructions');
  });
});

describe('Intake sees care preferences (AR-03)', () => {
  it('a queued bag carries starch, fold/hang and detergent, not the gate code', async () => {
    state.rows = [order('picked_up', savedPrefs)];
    const body = await (await intakeGET(new Request('http://localhost/api/intake'))).json();
    expect(body.queue[0].customer.preferences).toEqual({
      starch_level: 'light',
      fold_vs_hang: 'fold',
      detergent_sensitivity: 'Hypoallergenic only',
    });
  });

  it('the intake ticket shows the care preferences', () => {
    const ticket = src('src/components/mission-control/IntakeTicketWorkspace.tsx');
    expect(ticket).toContain('starch_level');
    expect(ticket).toContain('detergent_sensitivity');
  });
});

describe('staffPreferences()', () => {
  it('handles a customer with no saved preferences', () => {
    expect(staffPreferences(null, 'driver')).toBeNull();
    expect(staffPreferences([], 'intake')).toBeNull();
  });

  it('drops empty access notes', () => {
    expect(staffPreferences({ gate_code: '', delivery_instructions: null }, 'driver')).toBeNull();
  });
});
