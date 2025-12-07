import { test, expect } from '@playwright/test';

test.describe('About Page', () => {
  test('should load successfully and display correct title', async ({ page }) => {
    await page.goto('/about');
    
    await expect(page).toHaveTitle(/SolidStart\+/);
    await expect(page).toHaveURL('http://localhost:3000/about');
  });

  test('should display page heading', async ({ page }) => {
    await page.goto('/about');
    
    const heading = page.getByRole('heading', { name: /About Page/i });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('About Page');
  });

  test('should display content paragraphs', async ({ page }) => {
    await page.goto('/about');
    
    // Should have 3 Lorem ipsum paragraphs
    const contentParagraphs = page.locator('main p.mx-8');
    await expect(contentParagraphs).toHaveCount(3);
    
    // Verify first paragraph contains expected text
    const firstParagraph = contentParagraphs.first();
    await expect(firstParagraph).toContainText('Lorem ipsum dolor sit amet');
  });

  test('should have working external link to solidjs.com', async ({ page }) => {
    await page.goto('/about');
    
    const solidjsLink = page.getByRole('link', { name: /solidjs\.com/i });
    await expect(solidjsLink).toBeVisible();
    await expect(solidjsLink).toHaveAttribute('href', 'https://solidjs.com');
    await expect(solidjsLink).toHaveAttribute('target', '_blank');
  });

  test('should have navigation link to Home page', async ({ page }) => {
    await page.goto('/about');
    
    // Target the link in the page content (not nav)
    const homeLink = page.locator('main').getByRole('link', { name: /^Home$/i });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute('href', '/');
  });

  test('should navigate to Home page when clicking link', async ({ page }) => {
    await page.goto('/about');
    
    // Target the link in the page content (not nav)
    const homeLink = page.locator('main').getByRole('link', { name: /^Home$/i });
    await homeLink.click();
    
    await expect(page).toHaveURL('http://localhost:3000/');
    await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).toBeVisible();
  });

  test('should display current page indicator', async ({ page }) => {
    await page.goto('/about');
    
    // Check that "About Page" text is present as current page indicator
    const pageText = page.locator('p', { hasText: 'About Page' }).last();
    await expect(pageText).toBeVisible();
  });

  test('should have proper page structure', async ({ page }) => {
    await page.goto('/about');
    
    const main = page.locator('main');
    await expect(main).toBeVisible();
    
    // Verify key elements exist within main
    await expect(main.locator('h1')).toBeVisible();
    await expect(main.locator('p')).toHaveCount(5); // 3 content + 2 navigation paragraphs
  });

  test('should render text with proper styling classes', async ({ page }) => {
    await page.goto('/about');
    
    // Verify content paragraphs have expected Tailwind classes
    const justifiedParagraphs = page.locator('p.text-justify');
    await expect(justifiedParagraphs).toHaveCount(3);
  });
});
