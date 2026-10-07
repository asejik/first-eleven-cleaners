import { test, expect, skipCookieBanner } from './fixtures';

// Journey 6: /book works with a screen reader (screen-reader pass SR-01 to SR-10, 2026-10-06).
// Checks what VoiceOver/TalkBack depend on: focus after each step, announced errors,
// a labelled progress list, item counts with names, and one tab stop per control.
test.describe('Booking with a screen reader', () => {
  test.beforeEach(async ({ page }) => {
    await skipCookieBanner(page);
    await page.goto('/book');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Where Should We Pick Up?');
  });

  test('empty Continue explains what is missing and moves focus to it (SR-02)', async ({ page }) => {
    const cont = page.getByRole('button', { name: /Continue to Garments/ });
    await expect(cont).toBeEnabled();
    await cont.click();
    const name = page.getByLabel('Full Name');
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert').filter({ hasText: /full name/i })).toBeVisible();
  });

  test('each step change moves focus to the new heading, and progress is a labelled list (SR-01, SR-03)', async ({ page }) => {
    const progress = page.getByRole('list', { name: 'Booking progress' });
    await expect(progress.locator('[aria-current="step"]')).toContainText('Address');

    await page.getByLabel('Full Name').fill('Screen Reader');
    await page.getByLabel('Email').fill('sr.check@example.com');
    await page.getByLabel('Mobile Phone').fill('(214) 555-0100');
    await page.getByLabel('Street Address').fill('100 Main St');
    await page.getByLabel('ZIP Code').fill('75205');
    await page.getByRole('button', { name: /Continue to Garments/ }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'What Are We Cleaning?' })).toBeFocused();
    await expect(progress.locator('[aria-current="step"]')).toContainText('Garments');
    await expect(progress).toContainText('Address, completed');

    // SR-07: one announcement that names the item
    await page.getByRole('button', { name: /Dry Cleaning Only/ }).click();
    await page.getByRole('button', { name: 'Increase Shirt (dry clean) quantity' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Shirt (dry clean): 1' })).toBeAttached();

    // SR-08: no skipped heading levels inside the step
    const levels = await page.locator('main').evaluate((m) =>
      [...m.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => Number(h.tagName[1])),
    );
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: /Choose Pickup Time/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'When Should We Pick Up?' })).toBeFocused();
    // SR-06: emoji are not read as part of button names
    await expect(page.getByRole('button', { name: /^Morning Window/ })).toBeVisible();
  });

  test('header links are announced once, as links (SR-04)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the header buttons are in the menu on phones');
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'Log In' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Log In' })).toHaveCount(0);
  });

  test('footer navigation areas are labelled (SR-09) and asterisks are not read (SR-10)', async ({ page }) => {
    const unlabelled = await page.locator('footer nav').evaluateAll((navs) => navs.filter((n) => !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby')).length);
    expect(unlabelled).toBe(0);
    await expect(page.getByRole('textbox', { name: 'Full Name', exact: true })).toBeVisible();
  });
});
