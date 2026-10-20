import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIFA_STATEMENT } from '@/lib/legal';
import { buildLlmsTxt } from '@/lib/llms';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#7): "3,500 professionals served", "27+ orders daily" and "0
// documented disputes" need supporting records; use the approved sentence and drop
// exclusivity statements.
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const UNSUPPORTED = [/3,500/, /27\+/, /Documented Disputes/i, /zero documented disputes/i, /Hundreds/, /selected to operate/i, /select few/i, /disputes in thirty seconds/i];

describe('FIFA World Cup claims', () => {
  it('the approved sentence', () => {
    expect(FIFA_STATEMENT).toBe(
      'Provided laundry and dry-cleaning services within the FIFA World Cup 2026 International Broadcast Centre in Dallas, supporting an international media and broadcast environment.',
    );
  });

  it.each(['src/app/page.tsx', 'src/app/about/page.tsx', 'src/lib/llms.ts'])('%s uses it and drops the unsupported figures', (file) => {
    const src = read(file);
    expect(src).toContain('FIFA_STATEMENT');
    for (const claim of UNSUPPORTED) expect(src).not.toMatch(claim);
  });

  it('llms.txt reads as a sentence', () => {
    expect(buildLlmsTxt()).toContain('First Eleven Cleaners provided laundry and dry-cleaning services within the FIFA World Cup 2026');
  });
});
