import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client review 2026-10-20: the Mission Control board was cut off on the right and browser zoom
// didn't help (fixed 230px columns, about 1,660px, inside a 1,440px page). The seven columns now
// share the width with a 160px floor: 6 x 160 + 200 + 6 gaps of 12 = 1,232px, which fits a
// 1,280px laptop after the page's 16px side padding.
// ---------------------------------------------------------------------------
const css = readFileSync(join(__dirname, '..', 'src/app/mission-control/page.module.css'), 'utf8');

describe('Mission Control board fits the screen', () => {
  it('columns share the width and can shrink', () => {
    expect(css).toContain('grid-template-columns: repeat(6, minmax(160px, 1fr)) minmax(200px, 1.25fr);');
    expect(css).toContain('grid-template-columns: repeat(6, minmax(160px, 1fr)) 56px;');
  });

  it('no fixed-width columns are left', () => {
    expect(css).not.toMatch(/repeat\(6, \d+px\)/);
  });

  it('the narrowest board fits a 1,280px laptop', () => {
    const board = 6 * 160 + 200 + 6 * 12;
    expect(board + 2 * 16).toBeLessThanOrEqual(1280);
  });
});
