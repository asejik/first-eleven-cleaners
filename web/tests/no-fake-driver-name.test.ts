import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P05 AR-22: when a delivery photo had no recorded staff name, the customer's
// Garment Passport said "by Marcus (Route Driver)" (and intake photos "by Elena
// (Intake)"): made-up staff names (PR-22 class).
// ---------------------------------------------------------------------------
describe('No made-up driver names on customer pages (AR-22)', () => {
  it('the Garment Passport falls back to a neutral label', () => {
    const code = readFileSync(join(__dirname, '..', 'src/components/orders/GarmentPassportTimeline.tsx'), 'utf8');
    expect(code).not.toMatch(/Marcus|Elena/);
    expect(code).toContain("'our driver'");
    expect(code).toContain("'our intake team'");
  });
});
