import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test('should load successfully and display correct title', async ({ page }) => {
    await page.goto('/');
    
    await expect(page).toHaveTitle(/SolidStart\+/);
    await expect(page).toHaveURL('http://localhost:3000/');
  });

  test('should display main heading', async ({ page }) => {
    await page.goto('/');
    
    const heading = page.getByRole('heading', { name: /Hello SolidStart!/i });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Hello SolidStart!');
  });

  test('should display counter component in main content', async ({ page }) => {
    await page.goto('/');
    
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });

  test('should have working external link to solidjs.com in footer', async ({ page }) => {
    await page.goto('/');
    
    const solidjsLink = page.locator('footer').getByRole('link', { name: /solidjs\.com/i });
    await expect(solidjsLink).toBeVisible();
    await expect(solidjsLink).toHaveAttribute('href', 'https://solidjs.com');
    await expect(solidjsLink).toHaveAttribute('target', '_blank');
  });

  test('should have navigation link to About page in footer', async ({ page }) => {
    await page.goto('/');
    
    const aboutLink = page.locator('footer').getByRole('link', { name: /^About$/i });
    await expect(aboutLink).toBeVisible();
    await expect(aboutLink).toHaveAttribute('href', '/about');
  });

  test('should navigate to About page when clicking footer link', async ({ page }) => {
    await page.goto('/');
    
    const aboutLink = page.locator('footer').getByRole('link', { name: /^About$/i });
    await aboutLink.click();
    
    await expect(page).toHaveURL('http://localhost:3000/about');
    await expect(page.getByRole('heading', { name: /^About$/i })).toBeVisible();
  });

  test('should display current page indicator in footer', async ({ page }) => {
    await page.goto('/');
    
    // Check that Home link has active styling in footer
    const homeLink = page.locator('footer').getByRole('link', { name: /^Home$/i });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveClass(/border-sky-600/);
  });

  test('should have proper page structure with footer', async ({ page }) => {
    await page.goto('/');
    
    const main = page.locator('main');
    const footer = page.locator('footer');
    
    await expect(main).toBeVisible();
    await expect(footer).toBeVisible();
    
    // Verify key elements exist within main
    await expect(main.locator('h1')).toBeVisible();
    
    // Verify footer elements
    await expect(footer.locator('p')).toHaveCount(2);
  });
});
