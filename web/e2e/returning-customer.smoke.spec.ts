import { test, expect, signInAs } from './fixtures';

// Journey 2: a returning, signed-in customer opens the booking page (P05 AR-05, AR-13).
test('a signed-in customer gets a pre-filled booking form with no hydration error', async ({ page }) => {
  await signInAs(page, 'customer', 'Pat Returning');
  await page.goto('/book');
  await expect(page.getByLabel('Full Name')).toHaveValue('Pat Returning');
  await expect(page.getByLabel('Email')).toHaveValue('smoke.customer@example.com');
  await expect(page.getByText('Already a customer?')).toHaveCount(0);
  // The fixture fails the test on any hydration error
});
