import { describe, it, expect } from 'vitest';
import sitemap from '@/app/sitemap';

// ---------------------------------------------------------------------------
// P08 SEO-09: lastmod was the deploy time for every URL, so search engines
// learn to ignore it. With no real per-page edit dates, it is left out.
// ---------------------------------------------------------------------------
describe('Sitemap (P08 SEO-09)', () => {
  it('lists the 8 public pages without a made-up lastmod', () => {
    const entries = sitemap();
    expect(entries.map((e) => new URL(e.url).pathname)).toEqual([
      '/',
      '/book',
      '/pricing',
      '/about',
      '/commercial',
      '/service-areas',
      '/privacy',
      '/terms',
    ]);
    for (const e of entries) expect(e.lastModified).toBeUndefined();
  });
});
