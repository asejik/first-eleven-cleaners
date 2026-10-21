import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#9): "Verify ... garment tracking, photography, and commercial SLAs.
// Only advertise services currently supported." No barcodes, same-day turnaround, service
// credits, Net-30 statements or WhatsApp lines, which the business doesn't run today.
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Only services we run today', () => {
  it.each(['src/app/commercial/page.tsx', 'src/app/commercial/layout.tsx', 'src/app/terms/page.tsx'])('%s', (file) => {
    const src = read(file);
    for (const claim of [/barcod/i, /same-day turnaround/i, /service credit/i, /Net-30/i, /WhatsApp escalation/i, /SLA-backed/i, /studio lighting/i]) {
      expect(src).not.toMatch(claim);
    }
  });

  it('Commercial turnaround is the residential one (client 2026-10-21)', () => {
    expect(read('src/app/commercial/page.tsx')).toContain('{COMMERCIAL_TURNAROUND_TITLE}');
  });
});
