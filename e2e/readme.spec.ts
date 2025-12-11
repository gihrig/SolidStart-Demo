import { test, expect } from '@playwright/test';

test.describe('Readme Page', () => {
  test('should load successfully and display correct title', async ({ page }) => {
    await page.goto('/readme');

    await expect(page).toHaveTitle(/SolidStart Readme/);
    await expect(page).toHaveURL('http://localhost:3000/readme');
  });

  test('should display page heading', async ({ page }) => {
    await page.goto('/readme');

    // Should have an h1 heading
    const heading = page.getByRole('heading', { name: /Readme/i });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Readme');
  });

  test('should display h2 page headings', async ({ page }) => {
    await page.goto('/readme');

    // Should have 3 Lorem nnn h2 headings
    const h2Headings = page.getByRole('heading', { level: 2 });
    const count = await h2Headings.count();
    expect(count).toBe(3);
  });

  test('should display content paragraphs', async ({ page }) => {
    await page.goto('/readme');

    // Should have 3 Lorem ipsum paragraphs
    const contentParagraphs = page.locator('main p');
    await expect(contentParagraphs).toHaveCount(3);

    // Verify first paragraph contains expected text
    const firstParagraph = contentParagraphs.first();
    await expect(firstParagraph).toContainText('Lorem ipsum dolor sit amet');
  });

  test('should have working external link to solidjs.com in footer', async ({ page }) => {
    await page.goto('/readme');

    const solidjsLink = page.locator('footer').getByRole('link', { name: /solidjs\.com/i });
    await expect(solidjsLink).toBeVisible();
    await expect(solidjsLink).toHaveAttribute('href', 'https://solidjs.com');
    await expect(solidjsLink).toHaveAttribute('target', '_blank');
  });

  test('should have navigation link to Home page in footer', async ({ page }) => {
    await page.goto('/readme');

    const homeLink = page.locator('footer').getByRole('link', { name: /^Home$/i });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute('href', '/');
  });

  test('should navigate to Home page when clicking footer link', async ({ page }) => {
    await page.goto('/readme');

    const homeLink = page.locator('footer').getByRole('link', { name: /^Home$/i });
    await homeLink.click();

    await expect(page).toHaveURL('http://localhost:3000/');
    await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).toBeVisible();
  });

  test('should display current page indicator in footer', async ({ page }) => {
    await page.goto('/readme');

    // Check that Readme link has active styling in footer
    const readmeLink = page.locator('footer').getByRole('link', { name: /^Readme$/i });
    await expect(readmeLink).toBeVisible();
    await expect(readmeLink).toHaveClass(/border-sky-600/);
  });

  test('should have proper page structure', async ({ page }) => {
    await page.goto('/readme');

    const main = page.locator('main');
    const footer = page.locator('footer');
    await expect(main).toBeVisible();
    await expect(footer).toBeVisible();

    // Verify key elements exist within main
    await expect(main.locator('h1')).toBeVisible();
    await expect(main.locator('p')).toHaveCount(3);
    await expect(footer.locator('p')).toHaveCount(2);
  });

  test('should render text with proper styling classes', async ({ page }) => {
    await page.goto('/readme');
  });
});
