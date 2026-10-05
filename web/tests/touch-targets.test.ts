import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P05 AR-08: on phones, small buttons were 29 px tall, form fields 40 px, the
// consent checkboxes 13-17 px (below WCAG 2.2's 24 px minimum), and the pricing
// steppers and show-password button 28 px. Touch screens now get 44 px targets.
// ---------------------------------------------------------------------------
const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

/** The CSS inside the file's `@media (pointer: coarse)` blocks. */
function coarseCss(file: string): string {
  const css = src(file);
  const parts: string[] = [];
  let i = css.indexOf('@media (pointer: coarse)');
  while (i >= 0) {
    let depth = 0;
    let j = css.indexOf('{', i);
    for (let k = j; k < css.length; k++) {
      if (css[k] === '{') depth++;
      if (css[k] === '}') depth--;
      if (depth === 0) {
        j = k;
        break;
      }
    }
    parts.push(css.slice(i, j));
    i = css.indexOf('@media (pointer: coarse)', j);
  }
  return parts.join('\n');
}

describe('Touch targets are at least 44 px on touch screens (AR-08)', () => {
  it.each([
    ['src/components/ui/Button/Button.module.css', '.sm'],
    ['src/components/ui/Button/Button.module.css', '.md'],
    ['src/components/ui/Input/Input.module.css', '.input'],
    ['src/components/ui/Input/Input.module.css', '.passwordToggle'],
    ['src/app/pricing/page.module.css', '.qtyBtn'],
    ['src/app/pricing/page.module.css', '.expressOptionBtn'],
    ['src/app/pricing/page.module.css', '.zoneZipInput'],
    ['src/app/login/page.module.css', '.forgotLink a'],
    ['src/components/ui/RefreshButton/RefreshButton.module.css', '.refreshButton'],
  ])('%s %s', (file, selector) => {
    const css = coarseCss(file);
    const at = css.indexOf(selector);
    expect(at, `${selector} has no touch-screen rule`).toBeGreaterThanOrEqual(0);
    expect(css.slice(at, css.indexOf('}', at))).toMatch(/min-height:\s*44px/);
  });

  it('checkboxes are at least 24 px (WCAG 2.2 AA) everywhere', () => {
    expect(src('src/components/compliance/SmsConsentBlock.module.css')).toMatch(/\.checkboxInput \{[^}]*width: 24px;[^}]*height: 24px;/);
    expect(src('src/styles/globals.css')).toMatch(/input\[type='checkbox'\] \{[^}]*width: 24px;[^}]*height: 24px;/);
  });
});
