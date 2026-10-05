import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

// ---------------------------------------------------------------------------
// PR-28: correct install icons, reliable service-worker registration, and no
// caching of private pages (dashboards, tracking, Mission Control).
// ---------------------------------------------------------------------------
const PUBLIC = join(__dirname, '..', 'public');
const pngSize = (file: string) => {
  const buf = readFileSync(join(PUBLIC, file));
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
};

describe('Manifest icons (PR-28)', () => {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.json'), 'utf8'));
  const icons = manifest.icons as Array<{ src: string; sizes: string; purpose?: string }>;

  it('every declared icon size matches the real image', () => {
    for (const icon of icons) expect(pngSize(icon.src.replace(/^\//, '')), icon.src).toBe(icon.sizes);
  });

  it('has a 192px icon and a padded maskable icon separate from the regular one', () => {
    expect(icons.some((i) => i.sizes === '192x192')).toBe(true);
    const maskable = icons.filter((i) => i.purpose?.includes('maskable'));
    const regular = icons.filter((i) => !i.purpose || i.purpose.includes('any'));
    expect(maskable.length).toBeGreaterThan(0);
    for (const m of maskable) expect(regular.map((r) => r.src)).not.toContain(m.src);
  });
});

// Run public/sw.js against a fake service-worker global
async function runServiceWorkerFetch(pathname: string, mode: 'navigate' | 'no-cors' = 'navigate') {
  const listeners: Record<string, (e: unknown) => void> = {};
  const put = vi.fn();
  const cache = { put, match: vi.fn(async () => undefined), addAll: vi.fn(async () => {}) };
  const sandbox = {
    self: {
      location: { origin: 'https://firstelevencleaners.com' },
      addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
    caches: { open: async () => cache, match: async () => undefined, keys: async () => [], delete: async () => true },
    fetch: async () => ({ status: 200, clone: () => ({}) }),
    URL,
    console,
  };
  vm.runInNewContext(readFileSync(join(PUBLIC, 'sw.js'), 'utf8'), sandbox);
  let responded: Promise<unknown> | null = null;
  listeners.fetch({
    request: { method: 'GET', mode, url: `https://firstelevencleaners.com${pathname}` },
    respondWith: (p: Promise<unknown>) => (responded = p),
  });
  if (responded) await responded;
  await new Promise((r) => setTimeout(r, 0));
  return put;
}

describe('Service worker caching (PR-28)', () => {
  it('never stores private pages in the offline cache', async () => {
    for (const path of ['/dashboard', '/dashboard/orders/abc', '/track/11111111-2222-3333-4444-555555555555', '/mission-control', '/staff/driver', '/claim/x']) {
      const put = await runServiceWorkerFetch(path);
      expect(put, path).not.toHaveBeenCalled();
    }
  });

  it('still caches public pages for offline use', async () => {
    const put = await runServiceWorkerFetch('/pricing');
    expect(put).toHaveBeenCalled();
  });

  it('uses a new cache version so previously cached private pages are cleared', () => {
    expect(readFileSync(join(PUBLIC, 'sw.js'), 'utf8')).not.toContain("'f11-cleaners-v1'");
  });
});

describe('Service worker registration (PR-28)', () => {
  it('registers even when the page finished loading before React ran', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'components', 'pwa', 'ServiceWorkerRegister.tsx'), 'utf8');
    expect(src).toContain("document.readyState === 'complete'");
  });
});
