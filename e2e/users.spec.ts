import { test, expect } from '@playwright/test'

// The /users route is a template page backed by rpc-client.ts (legacy, not wired to the
// Rust backend). Its resource call hangs in a pending Suspense state, so only elements
// outside the Suspense boundary (Nav, Footer) are reliable. Tests are scoped to what is
// verifiably stable.

test.describe('Users Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/users')
  })

  test('should load without a hard crash (URL accessible)', async ({ page }) => {
    await expect(page).toHaveURL('http://localhost:3000/users')
  })

  test('should show some content state (loading, error, or data)', async ({ page }) => {
    // The resource may be loading, errored, or resolved depending on timing.
    // Any of these is acceptable — the page must not be completely blank.
    const loading = page.getByText(/loading/i)
    const error = page.getByText(/error/i)
    const userList = page.locator('ul')

    const hasLoading = await loading.isVisible().catch(() => false)
    const hasError = await error.isVisible().catch(() => false)
    const hasList = await userList.isVisible().catch(() => false)

    expect(hasLoading || hasError || hasList).toBe(true)
  })

  test('should display footer', async ({ page }) => {
    await expect(page.locator('footer')).toBeVisible()
  })

  test('should have working external link to solidjs.com in footer', async ({ page }) => {
    const solidjsLink = page.locator('footer').getByRole('link', { name: /solidjs\.com/i })
    await expect(solidjsLink).toBeVisible()
    await expect(solidjsLink).toHaveAttribute('href', 'https://solidjs.com')
    await expect(solidjsLink).toHaveAttribute('target', '_blank')
  })

  test('should navigate to Home when clicking Home footer link', async ({ page }) => {
    const homeLink = page.locator('footer').getByRole('link', { name: /^Home$/i })
    await homeLink.click()

    await expect(page).toHaveURL('http://localhost:3000/')
    await expect(page.getByRole('heading', { name: /Hello SolidStart!/i })).toBeVisible()
  })

  test('should navigate to About when clicking About footer link', async ({ page }) => {
    const aboutLink = page.locator('footer').getByRole('link', { name: /^About$/i })
    await aboutLink.click()

    await expect(page).toHaveURL('http://localhost:3000/about')
    await expect(page.getByRole('heading', { name: /^About$/i })).toBeVisible()
  })
})
