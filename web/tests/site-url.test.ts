import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P08 SEO-01: the live site is served on www (the bare domain 308-redirects
// there), so canonicals, OG URLs, JSON-LD and links must all name www.
// ---------------------------------------------------------------------------
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}
const SRC = join(__dirname, '..', 'src');

describe('Site URL uses the www host (P08 SEO-01)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('SITE_URL is the www production address', async () => {
    const { SITE_URL } = await import('@/lib/seo');
    expect(SITE_URL).toBe('https://www.firstelevencleaners.com');
  });

  it('no source file links to the bare domain, which only redirects', () => {
    const offenders = sourceFiles(SRC).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${f}:${i + 1}` }))
        .filter(({ line }) => line.includes('https://firstelevencleaners.com'))
        .map(({ at }) => at),
    );
    expect(offenders).toEqual([]);
  });

  it('the root layout takes metadataBase and JSON-LD URLs from SITE_URL', () => {
    const layout = readFileSync(join(SRC, 'app', 'layout.tsx'), 'utf8');
    expect(layout).toContain('metadataBase: new URL(SITE_URL)');
  });

  it('getAppBaseUrl falls back to www in production', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    vi.stubEnv('VERCEL_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    const { getAppBaseUrl } = await import('@/lib/constants');
    const { SITE_URL } = await import('@/lib/seo');
    expect(getAppBaseUrl()).toBe(SITE_URL);
  });
});
