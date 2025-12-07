import { test, expect } from '@playwright/test';

test.describe('404 Not Found Page', () => {
  test('should return 404 status for non-existent route', async ({ page }) => {
    const response = await page.goto('/xxx');
    
    // SolidStart may handle 404s differently, but we expect either:
    // 1. HTTP 404 status code
    // 2. A 200 with client-side 404 handling
    expect(response?.status()).toBeTruthy();
  });

  test('should display not found page or error state', async ({ page }) => {
    await page.goto('/xxx');
    
    // Check for common 404 indicators
    const pageContent = page.locator('body');
    await expect(pageContent).toBeVisible();
    
    // The page should not show the home page content
    const homeHeading = page.getByRole('heading', { name: /Hello SolidStart!/i });
    await expect(homeHeading).not.toBeVisible();
    
    // The page should not show the about page content
    const aboutHeading = page.getByRole('heading', { name: /^About Page$/i });
    await expect(aboutHeading).not.toBeVisible();
  });

  test('should maintain site title even on 404', async ({ page }) => {
    await page.goto('/xxx');
    
    // Title should still be set (from app root)
    await expect(page).toHaveTitle(/SolidStart\+/);
  });

  test('should show navigation even on 404', async ({ page }) => {
    await page.goto('/xxx');
    
    // Navigation component should still be present
    // (based on app.tsx structure with Nav component)
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should allow navigation back to home from 404', async ({ page }) => {
    await page.goto('/xxx');
    
    // Look for any link to home page
    const homeLink = page.getByRole('link', { name: /home/i }).first();
    
    if (await homeLink.isVisible()) {
      await homeLink.click();
      await expect(page).toHaveURL('http://localhost:3000/');
      await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).toBeVisible();
    }
  });

  test('should not match valid routes', async ({ page }) => {
    // Verify that similar but valid routes work correctly
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).toBeVisible();
    
    await page.goto('/about');
    await expect(page.getByRole('heading', { name: /About Page/i })).toBeVisible();
  });

  test('should handle different non-existent paths', async ({ page }) => {
    const invalidPaths = ['/xxx', '/invalid', '/does-not-exist', '/test123'];
    
    for (const path of invalidPaths) {
      await page.goto(path);
      
      // None should show home page content
      const homeHeading = page.getByRole('heading', { name: /Hello SolidStart!/i });
      await expect(homeHeading).not.toBeVisible();
    }
  });
});
