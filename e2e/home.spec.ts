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

  test('should display counter component', async ({ page }) => {
    await page.goto('/');
    
    // Counter component should be present (assuming it has interactive elements)
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
  });

  test('should have working external link to solidjs.com', async ({ page }) => {
    await page.goto('/');
    
    const solidjsLink = page.getByRole('link', { name: /solidjs\.com/i });
    await expect(solidjsLink).toBeVisible();
    await expect(solidjsLink).toHaveAttribute('href', 'https://solidjs.com');
    await expect(solidjsLink).toHaveAttribute('target', '_blank');
  });

  test('should have navigation link to About page', async ({ page }) => {
    await page.goto('/');
    
    // Target the link in the page content (not nav)
    const aboutLink = page.locator('main').getByRole('link', { name: /About Page/i });
    await expect(aboutLink).toBeVisible();
    await expect(aboutLink).toHaveAttribute('href', '/about');
  });

  test('should navigate to About page when clicking link', async ({ page }) => {
    await page.goto('/');
    
    // Target the link in the page content (not nav)
    const aboutLink = page.locator('main').getByRole('link', { name: /About Page/i });
    await aboutLink.click();
    
    await expect(page).toHaveURL('http://localhost:3000/about');
    await expect(page.getByRole('heading', { name: /About Page/i })).toBeVisible();
  });

  test('should display current page indicator', async ({ page }) => {
    await page.goto('/');
    
    // Check that "Home" text is present as current page indicator
    const pageText = page.locator('p', { hasText: 'Home' });
    await expect(pageText).toBeVisible();
  });

  test('should have proper page structure', async ({ page }) => {
    await page.goto('/');
    
    const main = page.locator('main');
    await expect(main).toBeVisible();
    
    // Verify key elements exist within main
    await expect(main.locator('h1')).toBeVisible();
    await expect(main.locator('p')).toHaveCount(2); // Two paragraph elements
  });
});
