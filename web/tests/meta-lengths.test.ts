import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P08 SEO-11: Google shows about 60 characters of a title and 155-160 of a
// description; longer ones are cut off mid-sentence in results.
// ---------------------------------------------------------------------------
const APP = join(__dirname, '..', 'src', 'app');
const BRAND_SUFFIX = ' | First Eleven Cleaners';

const PAGES: [path: string, file: string][] = [
  ['/', 'page.tsx'],
  ['/book', 'book/layout.tsx'],
  ['/pricing', 'pricing/layout.tsx'],
  ['/about', 'about/page.tsx'],
  ['/commercial', 'commercial/layout.tsx'],
  ['/service-areas', 'service-areas/page.tsx'],
  ['/privacy', 'privacy/page.tsx'],
  ['/terms', 'terms/page.tsx'],
];

function metaOf(file: string) {
  const src = readFileSync(join(APP, file), 'utf8');
  const block = src.slice(src.indexOf('pageMetadata({'));
  const str = (name: string) => block.match(new RegExp(`${name}:\\s*'((?:[^'\\\\]|\\\\.)*)'`))![1].replace(/\\'/g, "'");
  return { title: str('title'), description: str('description') };
}

describe('Titles and descriptions fit in search results (P08 SEO-11)', () => {
  it.each(PAGES)('%s title is at most 60 characters as shown', (path, file) => {
    const { title } = metaOf(file);
    const shown = path === '/' ? title : title + BRAND_SUFFIX;
    expect(shown.length, shown).toBeLessThanOrEqual(60);
  });

  it.each(PAGES)('%s description is at most 160 characters', (_path, file) => {
    const { description } = metaOf(file);
    expect(description.length, description).toBeLessThanOrEqual(160);
  });
});
