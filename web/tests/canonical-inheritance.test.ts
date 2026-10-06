import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P08 SEO-08: a canonical in the root layout is inherited by every page that
// doesn't set its own, so private pages and the 404 page pointed at the
// homepage, and a new public page would silently do the same. Each public page
// sets its own canonical (pageMetadata, SEO-04); the root sets none.
// ---------------------------------------------------------------------------
const APP = join(__dirname, '..', 'src', 'app');

describe('No page inherits the homepage canonical (P08 SEO-08)', () => {
  it('the root layout sets no canonical', () => {
    const layout = readFileSync(join(APP, 'layout.tsx'), 'utf8');
    expect(layout).not.toMatch(/alternates|canonical/);
  });

  it('the homepage sets its own canonical', () => {
    expect(readFileSync(join(APP, 'page.tsx'), 'utf8')).toContain("path: '/'");
  });

  it('the 404 page has its own title instead of the homepage title', () => {
    const notFound = readFileSync(join(APP, 'not-found.tsx'), 'utf8');
    expect(notFound).toMatch(/export const metadata[^]*title: 'Page Not Found'/);
  });
});
