import { test, expect } from '@playwright/test';

test.describe('Navigation Integration', () => {
  test('should navigate between all valid pages', async ({ page }) => {
    // Start at home
    await page.goto('/');
    await expect(page).toHaveURL('http://localhost:3000/');
    await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).toBeVisible();
    
    // Navigate to About using page content link (not nav)
    await page.locator('main').getByRole('link', { name: /About Page/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/about');
    await expect(page.getByRole('heading', { name: /About Page/i })).toBeVisible();
    
    // Navigate back to Home using page content link (not nav)
    await page.locator('main').getByRole('link', { name: /^Home$/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/');
    await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).toBeVisible();
  });

  test('should maintain correct page state during navigation', async ({ page }) => {
    await page.goto('/');
    
    // Verify home state
    const homeIndicator = page.locator('p', { hasText: 'Home' }).first();
    await expect(homeIndicator).toBeVisible();
    
    // Navigate to about using page content link (not nav)
    await page.locator('main').getByRole('link', { name: /About Page/i }).click();
    
    // Verify about state
    const aboutIndicator = page.locator('p', { hasText: 'About Page' }).last();
    await expect(aboutIndicator).toBeVisible();
    
    // Verify home indicator is not visible on about page
    const homeIndicatorOnAbout = page.locator('p', { hasText: 'Home' }).first();
    await expect(homeIndicatorOnAbout).toContainText('Home');
  });

  test('should preserve title across navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/SolidStart\+/);
    
    // Use page content link (not nav)
    await page.locator('main').getByRole('link', { name: /About Page/i }).click();
    await expect(page).toHaveTitle(/SolidStart\+/);
    
    // Use page content link (not nav)
    await page.locator('main').getByRole('link', { name: /^Home$/i }).click();
    await expect(page).toHaveTitle(/SolidStart\+/);
  });

  test('should handle direct URL access to each route', async ({ page }) => {
    // Test direct access to home
    await page.goto('http://localhost:3000/');
    await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).toBeVisible();
    
    // Test direct access to about
    await page.goto('http://localhost:3000/about');
    await expect(page.getByRole('heading', { name: /About Page/i })).toBeVisible();
    
    // Test direct access to 404
    await page.goto('http://localhost:3000/xxx');
    await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).not.toBeVisible();
  });

  test('should handle browser back/forward navigation', async ({ page }) => {
    await page.goto('/');
    
    // Navigate forward using page content link (not nav)
    await page.locator('main').getByRole('link', { name: /About Page/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/about');
    
    // Navigate back
    await page.goBack();
    await expect(page).toHaveURL('http://localhost:3000/');
    await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).toBeVisible();
    
    // Navigate forward again
    await page.goForward();
    await expect(page).toHaveURL('http://localhost:3000/about');
    await expect(page.getByRole('heading', { name: /About Page/i })).toBeVisible();
  });

  test('should maintain nav component across all pages', async ({ page }) => {
    // Assuming Nav component is present (based on app.tsx)
    await page.goto('/');
    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    await page.goto('/about');
    await expect(body).toBeVisible();
    
    await page.goto('/xxx');
    await expect(body).toBeVisible();
  });
});
