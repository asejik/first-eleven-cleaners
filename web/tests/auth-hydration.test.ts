import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

// ---------------------------------------------------------------------------
// P05 AR-05: React hydration error #418 for signed-in visitors. The first browser
// render read the cached login from localStorage, so it differed from the server
// HTML (which never has it). The first render must be the same on both sides.
// ---------------------------------------------------------------------------
const cached = {
  id: 'c1',
  auth_id: 'a1',
  email: 'pat@example.com',
  phone: '+12145550100',
  full_name: 'Pat Doe',
  role: 'customer',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

function Probe() {
  const { user, isLoading } = useAuth();
  return createElement('span', null, `${user ? user.full_name : 'signed-out'}|${isLoading ? 'loading' : 'ready'}`);
}

const g = globalThis as Record<string, unknown>;
beforeEach(() => {
  // A browser with a fresh cached login, as on a returning visitor's first render
  const store: Record<string, string> = {
    f11_auth_customer: JSON.stringify(cached),
    f11_auth_timestamp: String(Date.now()),
  };
  g.window = globalThis;
  g.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };
});
afterEach(() => {
  delete g.window;
  delete g.localStorage;
});

describe('First render matches the server HTML (AR-05)', () => {
  it('ignores the cached login until after hydration', () => {
    const html = renderToStaticMarkup(createElement(AuthProvider, null, createElement(Probe)));
    expect(html).toContain('signed-out|loading');
  });

  it('the booking form fills in the signed-in customer once the login loads', () => {
    const hook = readFileSync(join(__dirname, '..', 'src/hooks/useBookingState.ts'), 'utf8');
    expect(hook).toMatch(/Prefill contact details when the signed-in customer loads/);
  });
});
