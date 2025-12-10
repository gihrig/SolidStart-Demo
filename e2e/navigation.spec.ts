import { test, expect } from '@playwright/test';

// 1. Nav bar structure verification
test('should render nav bar with correct structure', async ({ page }) => {
  await page.goto('/');

  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav).toBeVisible();

  // Verify all expected links exist
  const homeLink = nav.getByRole('link', { name: 'Home' });
  const aboutLink = nav.getByRole('link', { name: 'About' });
  const readmeLink = nav.getByRole('link', { name: 'Readme' });

  await expect(homeLink).toBeVisible();
  await expect(aboutLink).toBeVisible();
  await expect(readmeLink).toBeVisible();

  // Verify correct href attributes
  await expect(homeLink).toHaveAttribute('href', '/');
  await expect(aboutLink).toHaveAttribute('href', '/about');
  await expect(readmeLink).toHaveAttribute('href', '/readme');
});

// 2. Nav bar link navigation
test('should navigate via nav bar links to expected pages', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });

  // Navigate to About via nav
  await nav.getByRole('link', { name: 'About' }).click();
  await expect(page).toHaveURL('http://localhost:3000/about');
  await expect(page.getByRole('heading', { name: /^About$/i })).toBeVisible();

  // Navigate to Readme via nav
  await nav.getByRole('link', { name: 'Readme' }).click();
  await expect(page).toHaveURL('http://localhost:3000/readme');

  // Navigate back to Home via nav
  await nav.getByRole('link', { name: 'Home' }).click();
  await expect(page).toHaveURL('http://localhost:3000/');
  await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).toBeVisible();
});

// 3. Nav bar persistence
test('should maintain nav bar across all pages', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Main' });

  // Check on home page
  await page.goto('/');
  await expect(nav).toBeVisible();

  // Check on about page
  await page.goto('/about');
  await expect(nav).toBeVisible();

  // Check on readme page
  await page.goto('/readme');
  await expect(nav).toBeVisible();

  // Check on 404 page
  await page.goto('/nonexistent');
  await expect(nav).toBeVisible();
});

// 4. Active link state indication
test('should show correct active state for current page', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Main' });

  // Home page - Home link should be active
  await page.goto('/');
  const homeLink = nav.getByRole('link', { name: 'Home' });
  await expect(homeLink).toHaveClass(/border-sky-600/);

  // About page - About link should be active, others inactive
  await page.goto('/about');
  const aboutLink = nav.getByRole('link', { name: 'About' });
  await expect(aboutLink).toHaveClass(/border-sky-600/);
  await expect(homeLink).toHaveClass(/border-transparent/);

  // Readme page - Readme link should be active
  await page.goto('/readme');
  const readmeLink = nav.getByRole('link', { name: 'Readme' });
  await expect(readmeLink).toHaveClass(/border-sky-600/);
  await expect(homeLink).toHaveClass(/border-transparent/);
  await expect(aboutLink).toHaveClass(/border-transparent/);
});

// 5. Active state during navigation
test('should update active state during nav bar navigation', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });

  const homeLink = nav.getByRole('link', { name: 'Home' });
  const aboutLink = nav.getByRole('link', { name: 'About' });
  const readmeLink = nav.getByRole('link', { name: 'Readme' });

  // Initial state
  await expect(homeLink).toHaveClass(/border-sky-600/);

  // Navigate and verify state change
  await aboutLink.click();
  await expect(aboutLink).toHaveClass(/border-sky-600/);
  await expect(homeLink).toHaveClass(/border-transparent/);

  // Navigate again
  await readmeLink.click();
  await expect(readmeLink).toHaveClass(/border-sky-600/);
  await expect(aboutLink).toHaveClass(/border-transparent/);

  // Navigate back
  await homeLink.click();
  await expect(homeLink).toHaveClass(/border-sky-600/);
  await expect(readmeLink).toHaveClass(/border-transparent/);
});

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
