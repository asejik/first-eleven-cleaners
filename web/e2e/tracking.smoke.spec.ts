import { test, expect, skipCookieBanner } from './fixtures';

// Journey 3: tracking link (P05 AR-04, AR-10, AR-13). Mock order ord-001 is In Cleaning.
const STAGES = ['Booked', 'Picked Up', 'Weighed & Itemized', 'In Cleaning', 'Out for Delivery', 'Delivered'];

test.describe('Order tracking', () => {
  test.beforeEach(async ({ page }) => {
    await skipCookieBanner(page);
  });

  test('an active order shows the six stages and no Cancelled step', async ({ page }) => {
    await page.goto('/track/ord-001');
    await expect(page.getByRole('heading', { name: 'Live Garment Tracker' })).toBeVisible();
    for (const stage of STAGES) await expect(page.getByText(stage, { exact: true }).first()).toBeVisible();
    await expect(page.locator('[class*="stageTitle"]')).toHaveCount(6);
    await expect(page.locator('[class*="stageTitle"]', { hasText: 'Cancelled' })).toHaveCount(0);
  });

  test('a cancelled order shows the cancelled panel instead of a timeline', async ({ page }) => {
    await page.route('**/api/orders/ord-001', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.order.status = 'cancelled';
      await route.fulfill({ response, json: body });
    });
    await page.goto('/track/ord-001');
    await expect(page.getByText('This pickup was cancelled')).toBeVisible();
    await expect(page.locator('[class*="stageTitle"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Book a New Pickup/ })).toBeVisible();
  });

  test('a failed load offers Try Again, not "Order Not Found"', async ({ page }) => {
    await page.route('**/api/orders/ord-001', (route) => route.fulfill({ status: 429, json: { error: 'Too many' } }));
    await page.goto('/track/ord-001');
    await expect(page.getByText(/We couldn.t load this order/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
    await expect(page.getByText('Order Not Found')).toHaveCount(0);
  });
});
