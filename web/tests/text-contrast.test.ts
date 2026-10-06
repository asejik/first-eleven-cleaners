import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P05 AR-07: brand gold (#C9A14A, 2.4:1) and gold-dark (#B08A35, 3.2:1) were used
// for small text on white and cream, and light greys for captions; an axe scan
// found 73 WCAG AA contrast failures on 23 screens. Text on light backgrounds now
// uses --color-gold-text / --color-text-secondary (axe: 0 failures after).
// ---------------------------------------------------------------------------
const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function token(name: string): string {
  const m = src('src/styles/tokens.css').match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token ${name} not found`);
  return m[1];
}
/** The color declared in a CSS rule (first `color:` inside `selector {`). */
function ruleColor(file: string, selector: string): string {
  const css = src(file);
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`${selector} not found in ${file}`);
  const block = css.slice(start, css.indexOf('}', start));
  return block.match(/\n\s*color:\s*([^;]+);/)?.[1].trim() ?? '';
}

describe('Text contrast meets WCAG AA (AR-07)', () => {
  it('the text tokens pass 4.5:1 on white and cream', () => {
    for (const bg of ['#FFFFFF', token('color-cream')]) {
      expect(contrast(token('color-gold-text'), bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token('color-text-secondary'), bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  const lightBackgroundText: Array<[string, string]> = [
    ['src/app/page.module.css', '.servicePrice'],
    ['src/app/page.module.css', '.accent'],
    ['src/app/pricing/page.module.css', '.expressSurchargeText'],
    ['src/app/pricing/page.module.css', '.weightValue'],
    ['src/app/pricing/page.module.css', '.emptyNote'],
    ['src/app/login/page.module.css', '.forgotLink a'],
    ['src/app/login/page.module.css', '.signupLink'],
    ['src/app/signup/page.module.css', '.loginLink'],
    ['src/app/dashboard/page.module.css', '.statLink'],
    ['src/app/dashboard/page.module.css', '.welcomeSubtitle'],
    ['src/app/dashboard/profile/page.module.css', '.prefPill strong'],
    ['src/components/orders/GarmentPassportTimeline.module.css', '.badgeTag'],
    ['src/components/orders/GarmentPassportTimeline.module.css', '.timestamp'],
    ['src/app/dashboard/orders/[id]/page.module.css', '.eventTime'],
    ['src/app/track/[orderId]/page.module.css', '.photoTimestamp'],
    ['src/app/privacy/page.module.css', '.contactLink'],
    ['src/app/terms/page.module.css', '.contactLink'],
    ['src/app/dashboard/preferences/page.module.css', '.optionDesc'],
    // Screen-reader pass SR-05: booking states the AR-07 scan didn't reach
    ['src/app/book/page.module.css', '.weightBadge'],
    ['src/app/book/page.module.css', '.windowCard span'],
    ['src/app/book/page.module.css', '.tierBadge'],
    ['src/app/book/page.module.css', '.tierDesc'],
  ];

  it.each(lightBackgroundText)('%s %s uses an AA text colour, not brand gold or light grey', (file, selector) => {
    const color = ruleColor(file, selector);
    expect(color).not.toMatch(/--color-gold\)|--color-gold-dark|--color-gray-400|--color-gray-500/);
  });

  it('booking steps have no inline gold-dark text on their light cards (SR-05)', () => {
    for (const f of ['StepSchedule', 'StepReview', 'StepGarments', 'StepAddress']) {
      expect(src(`src/components/booking/${f}.tsx`), f).not.toContain("color: 'var(--color-gold-dark)'");
    }
  });

  it('upcoming tracker stages are no longer faded to 2.2:1', () => {
    for (const file of ['src/app/track/[orderId]/page.module.css', 'src/app/dashboard/orders/[id]/page.module.css']) {
      const css = src(file);
      const block = css.slice(css.indexOf('.stageCol {'), css.indexOf('}', css.indexOf('.stageCol {')));
      expect(block, file).not.toContain('opacity: 0.35');
    }
  });
});
