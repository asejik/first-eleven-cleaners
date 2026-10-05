import { test, expect, signInAs } from './fixtures';

// Journey 5: staff tools load for their roles (P05 AR-01, AR-06, AR-13).
test.describe('Staff tools', () => {
  test('driver manifest', async ({ page }) => {
    await signInAs(page, 'driver');
    await page.goto('/staff/driver');
    await expect(page.getByRole('heading', { name: 'First Eleven Driver' })).toBeVisible();
    await expect(page.getByText('Order Pick Up', { exact: false }).first()).toBeVisible();
  });

  test('intake station', async ({ page }) => {
    await signInAs(page, 'intake_staff');
    await page.goto('/mission-control/intake');
    await expect(page.getByRole('heading', { name: 'Central Intake Station' })).toBeVisible();
  });

  test('Mission Control board, with no test-SMS control or Growth tab', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto('/mission-control');
    await expect(page.getByRole('heading', { name: 'Mission Control Ops' })).toBeVisible();
    await expect(page.getByRole('button', { name: /B2B Accounts/ })).toHaveCount(0);
    await page.getByRole('button', { name: /Messaging Dispatch/ }).click();
    await expect(page.getByRole('heading', { name: /Message Log/ })).toBeVisible();
    await expect(page.getByText('Test SMS/WhatsApp')).toHaveCount(0);
  });
});
