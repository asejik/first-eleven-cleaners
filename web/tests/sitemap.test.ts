import { describe, it, expect } from 'vitest';
import sitemap from '@/app/sitemap';

// ---------------------------------------------------------------------------
// P08 SEO-09: lastmod was the deploy time for every URL, so search engines
// learn to ignore it. With no real per-page edit dates, it is left out.
// ---------------------------------------------------------------------------
describe('Sitemap (P08 SEO-09)', () => {
  it('lists the 8 public pages and the 9 city pages without a made-up lastmod', () => {
    const entries = sitemap();
    expect(entries.map((e) => new URL(e.url).pathname)).toEqual([
      '/',
      '/book',
      '/pricing',
      '/about',
      '/commercial',
      '/service-areas',
      '/service-areas/north-dallas',
      '/service-areas/plano',
      '/service-areas/richardson',
      '/service-areas/frisco',
      '/service-areas/park-cities-preston-hollow',
      '/service-areas/lewisville',
      '/service-areas/the-colony',
      '/service-areas/flower-mound',
      '/service-areas/coppell',
      '/privacy',
      '/terms',
    ]);
    for (const e of entries) expect(e.lastModified).toBeUndefined();
  });
});
