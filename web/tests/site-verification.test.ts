import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P08 SEO-10: optional Search Console / Bing verification tags are documented,
// and an unset Bing value emits no empty tag.
// ---------------------------------------------------------------------------
const WEB = join(__dirname, '..');

describe('Search engine verification settings (P08 SEO-10)', () => {
  it('.env.example documents both verification variables', () => {
    const example = readFileSync(join(WEB, '.env.example'), 'utf8');
    expect(example).toContain('NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=');
    expect(example).toContain('NEXT_PUBLIC_BING_SITE_VERIFICATION=');
  });

  it('an unset Bing value adds no empty msvalidate.01 tag', () => {
    const layout = readFileSync(join(WEB, 'src', 'app', 'layout.tsx'), 'utf8');
    expect(layout).not.toContain("NEXT_PUBLIC_BING_SITE_VERIFICATION || ''");
  });
});
