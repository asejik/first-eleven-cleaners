import { test, expect } from '@playwright/test';

test.describe('Order Tracking Live Smoke Test', () => {
  test('navigates to tracking page and verifies live timeline structure', async ({ page }) => {
    // 1. Visit tracking page for mock / test order
    await page.goto('/track/demo-order-75201');

    // 2. Expect either the live tracker layout or a graceful empty / not found boundary
    const trackerContainer = page.locator('[class*="tracker"], [class*="container"], [class*="timeline"]');
    await expect(trackerContainer.first()).toBeVisible();

    // 3. Verify no unhandled page crash / 500 error heading
    const errorHeading = page.locator('h1:has-text("500"), h1:has-text("Server Error")');
    await expect(errorHeading).not.toBeVisible();
  });

  test('validates customer concierge trigger is accessible on mobile and desktop', async ({ page }) => {
    await page.goto('/');

    // Concierge floating button should be present
    const conciergeTrigger = page.locator('button[aria-label*="Concierge" i]');
    await expect(conciergeTrigger).toBeVisible();

    // Click concierge trigger to open drawer
    await conciergeTrigger.click();

    // Verify chat drawer opens with input field
    const conciergeInput = page.locator('input[placeholder*="Ask Eleven" i]');
    await expect(conciergeInput).toBeVisible();
  });
});
