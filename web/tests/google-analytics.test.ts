import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyticsAllowed, gaMeasurementId } from '@/lib/analytics';

// ---------------------------------------------------------------------------
// Client 2026-10-20: "GA4 is set up." The tag loads only after "Accept All Cookies" (Texas
// TDPSA notice), never on staff pages, and only where the measurement ID is set.
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Measurement ID', () => {
  it('accepts a GA4 ID, trimmed and upper-cased', () => {
    expect(gaMeasurementId('G-9K0KDVHSBP')).toBe('G-9K0KDVHSBP');
    expect(gaMeasurementId(' g-9k0kdvhsbp ')).toBe('G-9K0KDVHSBP');
  });

  it('nothing loads without one, or with something that is not a GA4 ID', () => {
    for (const raw of [undefined, '', 'UA-12345-1', "G-ABC');alert(1);//", 'GTM-ABC123']) {
      expect(gaMeasurementId(raw)).toBeNull();
    }
  });
});

describe('Consent', () => {
  it('only Accept All Cookies allows analytics', () => {
    expect(analyticsAllowed('all')).toBe(true);
    for (const c of ['essential', 'unanswered', 'dismissed']) expect(analyticsAllowed(c)).toBe(false);
  });

  it('the tag is in the root layout and skips staff pages, even after a customer page loaded it', () => {
    expect(read('src/app/layout.tsx')).toContain('<GoogleAnalytics />');
    const tag = read('src/components/analytics/GoogleAnalytics.tsx');
    expect(tag).toContain('isStaffRoute(');
    expect(tag).toContain('[`ga-disable-${id}`] = staff');
    expect(tag).toContain('!analyticsAllowed(consent) || staff) return null');
  });

  it('the Privacy Policy names Google Analytics and the cookie choice', () => {
    expect(read('src/app/privacy/page.tsx')).toContain('only if you choose Accept All Cookies (Google Analytics)');
  });
});

describe('Content Security Policy', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('lets the Google tag load and send hits', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { default: config } = await import('../next.config');
    const csp = (await config.headers!()).flatMap((r) => r.headers).find((h) => h.key === 'Content-Security-Policy')!.value;
    const directive = (name: string) => csp.split(';').find((d) => d.trim().startsWith(name))!;
    expect(directive('script-src')).toContain('https://www.googletagmanager.com');
    expect(directive('connect-src')).toContain('https://*.google-analytics.com');
    expect(directive('connect-src')).toContain('https://*.analytics.google.com');
    expect(directive('img-src')).toContain('https://*.google-analytics.com');
  });
});
