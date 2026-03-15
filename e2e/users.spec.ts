import { test, expect } from '@playwright/test'

test.describe('Users Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/users')
  })

  test('should load and display page heading', async ({ page }) => {
    await expect(page).toHaveURL('http://localhost:3000/users')
    const heading = page.getByRole('heading', { name: /Users/i })
    await expect(heading).toBeVisible()
  })

  test('should display the Create User form', async ({ page }) => {
    const nameInput = page.getByPlaceholder('Name')
    const emailInput = page.getByPlaceholder('Email')
    const submitButton = page.getByRole('button', { name: /Create User/i })

    await expect(nameInput).toBeVisible()
    await expect(emailInput).toBeVisible()
    await expect(submitButton).toBeVisible()
  })

  test('name input should have required attribute', async ({ page }) => {
    const nameInput = page.getByPlaceholder('Name')
    await expect(nameInput).toHaveAttribute('required', '')
  })

  test('email input should have type email and required attribute', async ({ page }) => {
    const emailInput = page.getByPlaceholder('Email')
    await expect(emailInput).toHaveAttribute('type', 'email')
    await expect(emailInput).toHaveAttribute('required', '')
  })

  test('should show loading or error state (backend not guaranteed)', async ({ page }) => {
    // The users page attempts to fetch from the legacy rpc-client endpoint.
    // Either a loading indicator or an error message should appear (not a blank page).
    const loading = page.getByText(/loading/i)
    const error = page.getByText(/error/i)
    const userList = page.locator('ul')

    // At least one of these should be present after the resource settles
    const hasLoading = await loading.isVisible().catch(() => false)
    const hasError = await error.isVisible().catch(() => false)
    const hasList = await userList.isVisible().catch(() => false)

    expect(hasLoading || hasError || hasList).toBe(true)
  })

  test('should have proper page structure with footer', async ({ page }) => {
    const main = page.locator('main')
    const footer = page.locator('footer')

    await expect(main).toBeVisible()
    await expect(footer).toBeVisible()
    await expect(main.locator('h1')).toBeVisible()
  })

  test('should display current page indicator in footer for Users link', async ({ page }) => {
    const usersLink = page.locator('footer').getByRole('link', { name: /^Users$/i })
    await expect(usersLink).toBeVisible()
    await expect(usersLink).toHaveClass(/border-sky-600/)
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
