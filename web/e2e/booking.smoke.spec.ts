import { test, expect, skipCookieBanner } from './fixtures';

/** A Monday-Thursday date (Express pickup day) at least 3 days ahead, as YYYY-MM-DD. */
function nextExpressDay(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  while (d.getDay() < 1 || d.getDay() > 4) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Journey 1: a guest books a pickup (P05 AR-13). Mock mode: no card form, nothing saved.
test.describe('Guest booking', () => {
  test.beforeEach(async ({ page }) => {
    await skipCookieBanner(page);
  });

  test('reaches Review with the right subtotal, and Express is blocked for specialty items', async ({ page }) => {
    await page.goto('/book');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Where Should We Pick Up?');

    await page.getByLabel('Full Name').fill('Smoke Guest');
    await page.getByLabel('Email').fill('smoke.guest@example.com');
    await page.getByLabel('Mobile Phone').fill('(214) 555-0100');
    await page.getByLabel('Street Address').fill('100 Main St');
    await page.getByLabel('ZIP Code').fill('75201');
    await page.getByRole('button', { name: /Continue to Garments/ }).click();

    await page.getByRole('button', { name: /Dry Cleaning Only/ }).click();
    const addShirt = page.getByRole('button', { name: 'Increase Shirt (dry clean) quantity' });
    await addShirt.click();
    await addShirt.click();
    await page.getByRole('button', { name: 'Increase Dress (formal) quantity' }).click();
    await page.getByRole('button', { name: /Choose Pickup Time/ }).click();
    // Express is offered only on Monday-Thursday pickups, so don't depend on today's weekday
    await page.getByLabel('Pickup Date').fill(nextExpressDay());

    // A formal dress is a specialty item: Express is unavailable, with the reason shown
    await expect(page.getByRole('button', { name: /24-Hr Express/ })).toBeDisabled();
    await expect(page.getByText(/Express isn.t available for this order/)).toBeVisible();
    await page.getByRole('button', { name: /Review Order & Pricing/ }).click();

    // 2 x $8.99 + $27.99
    const subtotalRow = page.locator('div', { hasText: /^Garment Subtotal/ }).last();
    await expect(subtotalRow).toContainText('$45.97');
  });

  test('the Eleven concierge opens', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Concierge/i }).click();
    await expect(page.getByPlaceholder(/Ask Eleven/i)).toBeVisible();
  });
});
