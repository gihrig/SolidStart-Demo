import { test, expect } from '@playwright/test';

test('has correct page title and heading', async ({ page }) => {
  await page.goto('/');

  // SolidStart sets <title> via <Meta> or document.title
  await expect(page).toHaveTitle(/SolidStart+/);

  // Check main heading
  await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).toBeVisible();

  // Example: check that a link to /about exists
  await expect(page.getByRole('link', { name: /About/i })).toHaveURL('/about');
});
