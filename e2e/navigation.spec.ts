import { test, expect } from '@playwright/test';

test.describe('Navigation Integration', () => {
  test('should navigate between all valid pages', async ({ page }) => {
    // Start at home
    await page.goto('/');
    await expect(page).toHaveURL('http://localhost:3000/');
    await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).toBeVisible();
    
    // Navigate to About using footer link
    await page.locator('footer').getByRole('link', { name: /^About$/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/about');
    await expect(page.getByRole('heading', { name: /^About$/i })).toBeVisible();
    
    // Navigate back to Home using footer link
    await page.locator('footer').getByRole('link', { name: /^Home$/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/');
    await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).toBeVisible();
  });

  test('should maintain correct page state during navigation', async ({ page }) => {
    await page.goto('/');
    
    // Verify home state - Home link should have active styling
    const homeLink = page.locator('footer').getByRole('link', { name: /^Home$/i });
    await expect(homeLink).toHaveClass(/border-b-2 border-sky-600/);
    
    // Navigate to about using footer link
    await page.locator('footer').getByRole('link', { name: /^About$/i }).click();
    
    // Verify about state - About link should have active styling
    const aboutLink = page.locator('footer').getByRole('link', { name: /^About$/i });
    await expect(aboutLink).toHaveClass(/border-b-2 border-sky-600/);
    
    // Verify home link now has inactive styling
    const homeOnAbout = page.locator('footer').getByRole('link', { name: /^Home$/i });
    await expect(homeOnAbout).toHaveClass(/border-b-2 border-transparent/);
  });

  test('should preserve title across navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/SolidStart\+/);
    
    // Use footer link
    await page.locator('footer').getByRole('link', { name: /^About$/i }).click();
    await expect(page).toHaveTitle(/SolidStart\+/);
    
    // Use footer link
    await page.locator('footer').getByRole('link', { name: /^Home$/i }).click();
    await expect(page).toHaveTitle(/SolidStart\+/);
  });

  test('should handle direct URL access to each route', async ({ page }) => {
    // Test direct access to home
    await page.goto('http://localhost:3000/');
    await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).toBeVisible();
    
    // Test direct access to about
    await page.goto('http://localhost:3000/about');
    await expect(page.getByRole('heading', { name: /^About$/i })).toBeVisible();
    
    // Test direct access to 404
    await page.goto('http://localhost:3000/xxx');
    await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).not.toBeVisible();
  });

  test('should handle browser back/forward navigation', async ({ page }) => {
    await page.goto('/');
    
    // Navigate forward using footer link
    await page.locator('footer').getByRole('link', { name: /^About$/i }).click();
    await expect(page).toHaveURL('http://localhost:3000/about');
    
    // Navigate back
    await page.goBack();
    await expect(page).toHaveURL('http://localhost:3000/');
    await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).toBeVisible();
    
    // Navigate forward again
    await page.goForward();
    await expect(page).toHaveURL('http://localhost:3000/about');
    await expect(page.getByRole('heading', { name: /^About$/i })).toBeVisible();
  });

  test('should maintain footer component across all pages', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    
    await page.goto('/about');
    await expect(footer).toBeVisible();
    
    await page.goto('/xxx');
    await expect(footer).toBeVisible();
  });
});
