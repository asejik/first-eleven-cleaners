import { test, expect, signInAs } from './fixtures';

// Journey 4: customer dashboard, order detail and claim (P05 AR-13).
test('a customer sees their orders, opens one, and reaches the claim form', async ({ page }) => {
  await signInAs(page, 'customer');
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back');

  await page.goto('/dashboard/orders/ord-001');
  await expect(page.locator('[class*="stageLabel"]')).toHaveCount(6);

  await page.goto('/claim/ord-001');
  await expect(page.getByRole('heading', { name: /Make It Right/ })).toBeVisible();
});
