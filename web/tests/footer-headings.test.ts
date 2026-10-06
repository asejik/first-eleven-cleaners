import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P08 SEO-12: footer column titles were <h4> with no <h2>/<h3> above them,
// skipping heading levels on every page. They are <h2> styled by class.
// ---------------------------------------------------------------------------
const footer = readFileSync(join(__dirname, '..', 'src', 'components', 'layout', 'Footer', 'Footer.tsx'), 'utf8');

describe('Footer heading levels (P08 SEO-12)', () => {
  it('column titles are h2, not h4', () => {
    expect(footer).not.toContain('<h4');
    expect(footer.match(/<h2 [^>]*className=\{styles\.columnTitle\}>/g)).toHaveLength(4);
  });

  it('each footer nav is labelled by its heading (SR-09)', () => {
    for (const id of ['footer-services', 'footer-company', 'footer-support', 'footer-legal']) {
      expect(footer).toContain(`<h2 id="${id}"`);
      expect(footer).toContain(`aria-labelledby="${id}"`);
    }
  });
});
