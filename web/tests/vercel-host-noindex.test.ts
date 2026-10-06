import { describe, it, expect } from 'vitest';
import config from '../next.config';

// ---------------------------------------------------------------------------
// P08 SEO-06: first-eleven-cleaners.vercel.app serves the production site too.
// That copy must tell search engines not to index it.
// ---------------------------------------------------------------------------
async function vercelHostRule() {
  const rules = await config.headers!();
  return rules.find(
    (r) =>
      r.source === '/:path*' &&
      r.has?.some((h) => h.type === 'host') &&
      r.headers.some((h) => h.key === 'X-Robots-Tag' && h.value === 'noindex'),
  );
}

describe('The vercel.app copy is not indexed (P08 SEO-06)', () => {
  it('every path on a *.vercel.app host sends X-Robots-Tag: noindex', async () => {
    expect(await vercelHostRule()).toBeDefined();
  });

  it('the host pattern matches vercel.app hosts and not the real domain', async () => {
    const rule = await vercelHostRule();
    const hostCond = rule!.has!.find((h) => h.type === 'host')!;
    const pattern = new RegExp(`^${hostCond.value}$`);
    expect(pattern.test('first-eleven-cleaners.vercel.app')).toBe(true);
    expect(pattern.test('first-eleven-cleaners-fl52g8t8k-asejiks-projects.vercel.app')).toBe(true);
    expect(pattern.test('www.firstelevencleaners.com')).toBe(false);
    expect(pattern.test('firstelevencleaners.com')).toBe(false);
  });
});
