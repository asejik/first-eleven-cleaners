import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pageMetadata } from '@/lib/seo';

// ---------------------------------------------------------------------------
// P08 SEO-04: every public page gets a complete, page-specific link preview
// (og:url, title, description, type, site name, image) for OG and Twitter.
// ---------------------------------------------------------------------------
const WEB = join(__dirname, '..');

/** Width and height from a JPEG's SOF marker. */
function jpegSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error('no SOF marker');
}

const PUBLIC_PAGES: [path: string, file: string][] = [
  ['/', 'src/app/page.tsx'],
  ['/book', 'src/app/book/layout.tsx'],
  ['/pricing', 'src/app/pricing/layout.tsx'],
  ['/about', 'src/app/about/page.tsx'],
  ['/commercial', 'src/app/commercial/layout.tsx'],
  ['/service-areas', 'src/app/service-areas/page.tsx'],
  ['/privacy', 'src/app/privacy/page.tsx'],
  ['/terms', 'src/app/terms/page.tsx'],
];

describe('Complete link previews on public pages (P08 SEO-04)', () => {
  it('pageMetadata fills every OG and Twitter field for the page', () => {
    const m = pageMetadata({ path: '/about', title: 'Our Story', description: 'About us.', imageAlt: 'Alt' });
    expect(m.alternates?.canonical).toBe('/about');
    expect(m.openGraph).toMatchObject({
      url: '/about',
      type: 'website',
      siteName: 'First Eleven Cleaners',
      locale: 'en_US',
      title: 'Our Story | First Eleven Cleaners',
      description: 'About us.',
      images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Alt' }],
    });
    expect(m.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'Our Story | First Eleven Cleaners',
      description: 'About us.',
      images: ['/og-image.jpg'],
    });
  });

  it('the homepage title is used as-is, without the brand suffix twice', () => {
    const m = pageMetadata({ path: '/', title: 'First Eleven Cleaners | Home', description: 'd', imageAlt: 'a' });
    expect(m.title).toEqual({ absolute: 'First Eleven Cleaners | Home' });
    expect(m.openGraph?.title).toBe('First Eleven Cleaners | Home');
  });

  it.each(PUBLIC_PAGES)('%s builds its metadata with pageMetadata()', (path, file) => {
    const src = readFileSync(join(WEB, file), 'utf8');
    expect(src).toContain('pageMetadata({');
    expect(src).toContain(`path: '${path}'`);
  });

  it('the share image really is 1200 x 630, as declared', () => {
    expect(jpegSize(join(WEB, 'public', 'og-image.jpg'))).toEqual({ width: 1200, height: 630 });
  });
});
