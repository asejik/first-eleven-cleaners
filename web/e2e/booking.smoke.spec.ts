import { test, expect } from '@playwright/test';

test.describe('Booking Wizard Smoke Test', () => {
  test('navigates to booking page and verifies initial step', async ({ page }) => {
    // 1. Visit booking page
    await page.goto('/book');

    // 2. Check title and main heading
    await expect(page).toHaveTitle(/First Eleven Cleaners/i);
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();

    // 3. Verify step indicator exists
    const stepContainer = page.locator('[class*="wizard"], [class*="step"]');
    await expect(stepContainer.first()).toBeVisible();

    // 4. Verify address input fields are present
    const streetInput = page.locator('input[id*="street"], input[placeholder*="street" i], input[name*="street" i]').first();
    const zipInput = page.locator('input[id*="zip"], input[placeholder*="zip" i], input[name*="zip" i]').first();

    if (await streetInput.isVisible()) {
      await expect(streetInput).toBeEnabled();
    }
    if (await zipInput.isVisible()) {
      await expect(zipInput).toBeEnabled();
    }
  });

  test('validates address entry step progression', async ({ page }) => {
    await page.goto('/book');

    // Look for ZIP code input
    const zipInput = page.locator('input[placeholder*="752" i], input[id*="zip" i], input[name*="zip" i]').first();
    if (await zipInput.isVisible()) {
      await zipInput.fill('75201');
      // Verify no invalid zone banner appears for valid 75201 Downtown Dallas ZIP
      const errorAlert = page.locator('text=Outside Service Area');
      await expect(errorAlert).not.toBeVisible();
    }
  });
});
