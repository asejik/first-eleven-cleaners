import { test as base, expect, type Page } from '@playwright/test';

/**
 * Smoke-test fixture (P05 AR-13). Runs against `npm run dev` in mock mode (no Supabase or
 * Square keys: sample orders, mock logins, no real writes). Every test fails on an
 * uncaught page error or a React hydration error, whatever else it checks.
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && /hydrat|#418|did not match/i.test(m.text())) errors.push(`console: ${m.text()}`);
      });
      await use(errors);
      expect(errors, 'page errors or hydration errors').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export type MockRole = 'customer' | 'admin' | 'driver' | 'intake_staff';
const EMAILS: Record<MockRole, string> = {
  customer: 'smoke.customer@example.com',
  admin: 'admin@firstelevencleaners.com',
  driver: 'driver@firstelevencleaners.com',
  intake_staff: 'intake@firstelevencleaners.com',
};

/** Signs in a mock-mode user by seeding the cached session the app restores on load. */
export async function signInAs(page: Page, role: MockRole, fullName = 'Smoke Tester') {
  const customer = {
    id: 'c0000000-0000-0000-0000-000000000001',
    auth_id: 'c0000000-0000-0000-0000-000000000001',
    email: EMAILS[role],
    phone: '+12145550100',
    full_name: fullName,
    role,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  };
  await page.addInitScript((value) => {
    localStorage.setItem('f11_mock_user', value);
    localStorage.setItem('f11_auth_customer', value);
    localStorage.setItem('f11_auth_timestamp', String(Date.now()));
    localStorage.setItem('f11_cookie_consent', 'essential');
  }, JSON.stringify(customer));
}

/** Answers the cookie banner up front so it never covers the page under test. */
export async function skipCookieBanner(page: Page) {
  await page.addInitScript(() => localStorage.setItem('f11_cookie_consent', 'essential'));
}
