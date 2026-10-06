import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P08 SEO-07: a root loading.tsx wraps every page in a Suspense boundary, so
// even static public pages shipped a skeleton with the real content in a
// hidden div (invisible to crawlers that don't run JavaScript). Loading
// screens belong only on dynamic screens.
// ---------------------------------------------------------------------------
const APP = join(__dirname, '..', 'src', 'app');

describe('Static public pages render their content inline (P08 SEO-07)', () => {
  it('there is no root loading.tsx', () => {
    expect(existsSync(join(APP, 'loading.tsx'))).toBe(false);
  });

  it.each(['about', 'service-areas', 'privacy', 'terms', 'commercial', 'pricing', 'book'])(
    '/%s has no loading screen of its own',
    (route) => {
      expect(existsSync(join(APP, route, 'loading.tsx'))).toBe(false);
    },
  );

  it.each(['dashboard', 'mission-control', 'track/[orderId]'])('dynamic screen /%s keeps its loading screen', (route) => {
    expect(existsSync(join(APP, route, 'loading.tsx'))).toBe(true);
  });
});
