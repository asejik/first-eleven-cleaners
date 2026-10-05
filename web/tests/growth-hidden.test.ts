import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P05 AR-06: the Mission Control "B2B Accounts" (Growth) tab showed invented
// figures ("4.95 Rating", "3 Enterprise Facilities", "Automations Active"), and
// /api/growth (unused) returned made-up stats and logged win-back texts that were
// never sent. Owner decision 2026-10-05: hide it and delete the dead code.
// ---------------------------------------------------------------------------
const root = join(__dirname, '..');
const src = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('Growth tab and sample growth tools removed (AR-06)', () => {
  it('Mission Control has no Growth / B2B Accounts tab', () => {
    const page = src('src/app/mission-control/page.tsx');
    expect(page).not.toContain("'growth'");
    expect(page).not.toContain('B2B Accounts');
    expect(page).not.toContain('CommercialAndGrowth');
  });

  it('the sample-data growth card, API and helpers are gone', () => {
    for (const rel of [
      'src/components/mission-control/CommercialAndGrowth.tsx',
      'src/app/api/growth/route.ts',
      'src/lib/growth/index.ts',
    ]) {
      expect(existsSync(join(root, rel)), rel).toBe(false);
    }
    expect(src('src/components/mission-control/index.ts')).not.toContain('CommercialAndGrowth');
  });
});
