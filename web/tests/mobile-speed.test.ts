import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#15): "Please conduct a complete mobile performance review." The
// Lighthouse phone run (2026-10-20) found the chat's markdown libraries loading with every page
// and the homepage headline waiting on a fade-in before it counted as shown.
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Mobile speed', () => {
  it('the chat loads its markdown libraries only when a reply is shown', () => {
    const widget = read('src/components/concierge/ConciergeWidget.tsx');
    expect(widget).not.toMatch(/from 'react-markdown'|from 'remark-gfm'/);
    expect(widget).toContain("dynamic(() => import('./ConciergeMarkdown')");
    expect(read('src/components/concierge/ConciergeMarkdown.tsx')).toContain("from 'react-markdown'");
  });

  it('the homepage headline is visible from the first paint (no fade-in)', () => {
    const css = read('src/app/page.module.css');
    const hero = css.slice(css.indexOf('.heroContent {'), css.indexOf('}', css.indexOf('.heroContent {')));
    expect(hero).not.toContain('animation');
    expect(css).not.toContain('@keyframes fade-in');
  });
});
