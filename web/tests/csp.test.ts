import { describe, it, expect, vi, afterEach } from 'vitest';

async function cspFor(nodeEnv: 'production' | 'development') {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.resetModules();
  const { default: config } = await import('../next.config');
  const rules = await config.headers!();
  const header = rules.flatMap((r) => r.headers).find((h) => h.key === 'Content-Security-Policy');
  return header!.value;
}

describe('Content Security Policy (SEC-23)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("omits 'unsafe-eval' in production", async () => {
    const csp = await cspFor('production');
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'))!;
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("keeps 'unsafe-eval' for the dev server only", async () => {
    const csp = await cspFor('development');
    expect(csp).toContain("'unsafe-eval'");
  });

  it("allows Square's card processing hosts in production and sandbox", async () => {
    const csp = await cspFor('production');
    const connectSrc = csp.split(';').find((d) => d.trim().startsWith('connect-src'))!;
    expect(connectSrc).toContain('https://*.squareup.com');
    expect(connectSrc).toContain('https://*.squareupsandbox.com');
  });
});
