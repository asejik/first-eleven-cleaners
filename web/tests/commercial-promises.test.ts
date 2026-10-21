import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMMERCIAL_PROPOSAL_TIME, COMMERCIAL_REPLY, COMMERCIAL_TURNAROUND } from '@/lib/commercial/promises';

// ---------------------------------------------------------------------------
// Client answers 2026-10-21: commercial turnaround is the residential one (Monday to Friday
// pickups, 2 business days, no same-day); enquiries answered the same business day; proposals
// within two business days; the Match-Ready Check, guarantee and Garment Passport as residential.
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const page = read('src/app/commercial/page.tsx');

describe('Commercial page promises', () => {
  it('turnaround is 2 business days, Monday to Friday pickups, no same-day', () => {
    expect(COMMERCIAL_TURNAROUND).toBe('2 business days');
    expect(page).toContain('Pickups Monday to Friday, back {COMMERCIAL_TURNAROUND} after pickup');
    expect(page).toContain('We don&apos;t offer same-day service.');
    expect(page).not.toContain('Turnaround Agreed in Writing');
    expect(read('src/app/commercial/layout.tsx')).toContain('back in 2 business days');
  });

  it('replies the same business day and sends proposals within two business days', () => {
    expect(COMMERCIAL_REPLY).toBe('We reply the same business day.');
    expect(COMMERCIAL_PROPOSAL_TIME).toBe('within two business days');
    expect(page).not.toMatch(/24 business hours|within 24 hours/);
  });

  it('names the Match-Ready Check, the guarantee and the Garment Passport', () => {
    expect(page).toContain('11-Point Match-Ready Check');
    expect(page).toContain('Make It Right Guarantee');
    expect(page).toContain('tracked by order number in the Garment Passport');
    expect(page).not.toContain('item tagging');
  });
});
