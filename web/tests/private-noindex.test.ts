import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import robots from '@/app/robots';
import config from '../next.config';

// ---------------------------------------------------------------------------
// P08 SEO-05: private pages are kept out of search by noindex, which crawlers
// can only read if robots.txt lets them fetch the page. So robots.txt blocks
// only /api/, and private paths also send an X-Robots-Tag header.
// ---------------------------------------------------------------------------
const PRIVATE_SECTIONS = [
  'dashboard',
  'mission-control',
  'staff',
  'claim',
  'portal',
  'track',
  'login',
  'signup',
  'forgot-password',
  'reset-password',
];

async function robotsHeaderSources(): Promise<string[]> {
  const rules = await config.headers!();
  return rules
    .filter((r) => r.headers.some((h) => h.key === 'X-Robots-Tag' && h.value === 'noindex, nofollow'))
    .map((r) => r.source);
}

describe('Private pages can be read as noindex (P08 SEO-05)', () => {
  it('robots.txt blocks only the API, so noindex on private pages is readable', () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule.allow).toBe('/');
    expect(rule.disallow).toEqual(['/api/']);
  });

  it.each(PRIVATE_SECTIONS)('/%s sends X-Robots-Tag: noindex, nofollow', async (section) => {
    expect(await robotsHeaderSources()).toContain(`/${section}/:path*`);
  });

  it.each(PRIVATE_SECTIONS)('/%s also has noindex in its page metadata', (section) => {
    const dir = section === 'track' || section === 'claim' ? `${section}/[orderId]` : section;
    const layout = readFileSync(join(__dirname, '..', 'src', 'app', dir, 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/index:\s*false/);
  });
});
