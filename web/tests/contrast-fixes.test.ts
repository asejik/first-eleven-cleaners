import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Lighthouse phone run 2026-10-20 (client review #15): the accessibility items it flagged on
// Booking, Pricing, Commercial and the city pages.
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/** WCAG contrast ratio of two #RRGGBB colors */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('Contrast and heading fixes', () => {
  it('links in city page sentences use the dark gold, underlined', () => {
    const css = read('src/app/service-areas/page.module.css');
    expect(css).toMatch(/\.regionDesc a \{\s*color: var\(--color-gold-text\);\s*text-decoration: underline;/);
    expect(contrast('#8A6515', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#B08A35', '#FFFFFF')).toBeLessThan(4.5); // the old link color
  });

  it("booking's Extended Reach link takes the notice's dark green", () => {
    expect(read('src/app/book/page.module.css')).toMatch(/\.smartCoverageNotice a \{\s*color: inherit;/);
  });

  it('the failed pickup fee is a red that reads on its pink panel', () => {
    const pricing = read('src/app/pricing/page.tsx');
    expect(pricing).not.toContain("<strong style={{ color: 'var(--color-error)' }}>");
    expect(pricing).toContain("<strong style={{ color: '#B91C1C' }}>");
    expect(contrast('#B91C1C', '#FEF0F0')).toBeGreaterThanOrEqual(4.5);
  });

  it('Commercial headings go h2 then h3, never skipping to h4', () => {
    expect(read('src/app/commercial/page.tsx')).not.toContain('<h4>');
  });
});
