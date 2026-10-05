import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P05 AR-09: the keyboard focus ring was gold (#C9A14A): 2.4:1 on white, below
// the 3:1 a focus indicator needs, and invisible around gold (primary) buttons.
// It is now navy with a white halo, which shows on light and navy pages alike.
// Every `outline: none` must have a focus style to replace it.
// ---------------------------------------------------------------------------
const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

function rule(file: string, selector: string): string {
  const css = src(file);
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return '';
  return css.slice(at, css.indexOf('}', at));
}

describe('Visible keyboard focus (AR-09)', () => {
  it.each([
    ['src/components/ui/Button/Button.module.css', '.button:focus-visible'],
    ['src/styles/globals.css', ':focus-visible'],
  ])('%s %s uses the navy ring with a white halo', (file, selector) => {
    const css = rule(file, selector);
    expect(css).toMatch(/outline:\s*2px solid var\(--color-navy\)/);
    expect(css).toMatch(/box-shadow:[^;]*var\(--color-white\)/);
  });

  it('the Mission Control archive search box shows focus', () => {
    expect(src('src/components/mission-control/DeliveredArchive.module.css')).toMatch(/\.searchInput:focus-visible/);
  });
});
