import { test, expect } from '@playwright/test'

// 1. Nav bar visibility and structure verification
test('should render nav bar with correct visibility and structure', async ({
  page,
}) => {
  // Start at the Home page
  await page.goto('/')

  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav).toBeVisible()

  // Verify all expected links exist
  const homeLink = nav.getByRole('link', { name: 'Home' })
  const aboutLink = nav.getByRole('link', { name: 'About' })
  const readmeLink = nav.getByRole('link', { name: 'Readme' })

  await expect(homeLink).toBeVisible()
  await expect(aboutLink).toBeVisible()
  await expect(readmeLink).toBeVisible()

  // Verify correct href attributes
  await expect(homeLink).toHaveAttribute('href', '/')
  await expect(aboutLink).toHaveAttribute('href', '/about')
  await expect(readmeLink).toHaveAttribute('href', '/readme')
})

// 2. Nav bar link navigation
test('should navigate via nav bar links to expected pages', async ({
  page,
}) => {
  // Start at Home page
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav).toBeVisible()

  // Navigate to About via nav
  await nav.getByRole('link', { name: 'About' }).click()
  await expect(page).toHaveURL('http://localhost:3000/about')
  await expect(page.getByRole('heading', { name: /^About$/i })).toBeVisible()

  // Navigate to Readme via nav
  await nav.getByRole('link', { name: 'Readme' }).click()
  await expect(page).toHaveURL('http://localhost:3000/readme')
  await expect(page.getByRole('heading', { name: /^Readme$/i })).toBeVisible()

  // Navigate back to Home via nav
  await nav.getByRole('link', { name: 'Home' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')
  await expect(
    page.getByRole('heading', { name: /Hello SolidStart!/i })
  ).toBeVisible()
})

// 3. Nav bar persistence
test('should maintain nav bar across all pages', async ({ page }) => {
  // Start at Home page
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav).toBeVisible()

  // Check nav bar on home page
  await expect(nav).toBeVisible()

  // Check nav bar on about page
  await page.goto('/about')
  await expect(nav).toBeVisible()

  // Check nav bar on readme page
  await page.goto('/readme')
  await expect(nav).toBeVisible()

  // Check nav bar on 404 page
  await page.goto('/nonexistent')
  await expect(nav).toBeVisible()
})

// 4. Active nav bar link state for direct URL
test('should show active state for direct URL navigation', async ({ page }) => {
  // Start at Home page
  await page.goto('/')
  const homeLink = page.locator('nav').getByRole('link', { name: /^Home$/i })
  await expect(homeLink).toBeVisible
  const aboutLink = page.locator('nav').getByRole('link', { name: /^About$/i })
  await expect(aboutLink).toBeVisible
  const readmeLink = page
    .locator('nav')
    .getByRole('link', { name: /^Readme$/i })
  await expect(readmeLink).toBeVisible

  // Initial state Home active
  await expect(homeLink).toHaveClass(/border-b-4 border-sky-600 mx-1.5 sm:mx-6/)
  await expect(aboutLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )
  await expect(readmeLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )

  // About page - About link should be active
  await page.goto('/about')
  await expect(homeLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )
  await expect(aboutLink).toHaveClass(
    /border-b-4 border-sky-600 mx-1.5 sm:mx-6/
  )
  await expect(readmeLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )

  // Readme page - Readme link should be active
  await page.goto('/readme')
  await expect(homeLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )
  await expect(aboutLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )
  await expect(readmeLink).toHaveClass(
    /border-b-4 border-sky-600 mx-1.5 sm:mx-6/
  )
  //
  await page.goto('/nonexistent')
  await expect(homeLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )
  await expect(readmeLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )
  await expect(aboutLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )
})

// 5. Active nav bar state for navigation
test('should update active state for nav bar navigation', async ({ page }) => {
  // Start at Home page
  await page.goto('/')
  const homeLink = page.locator('nav').getByRole('link', { name: /^Home$/i })
  await expect(homeLink).toBeVisible
  const aboutLink = page.locator('nav').getByRole('link', { name: /^About$/i })
  await expect(aboutLink).toBeVisible
  const readmeLink = page
    .locator('nav')
    .getByRole('link', { name: /^Readme$/i })
  await expect(readmeLink).toBeVisible

  // Initial state Home active
  await expect(homeLink).toHaveClass(/border-b-4 border-sky-600 mx-1.5 sm:mx-6/)
  await expect(aboutLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )
  await expect(readmeLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )

  // Navigate to About and verify state change
  await aboutLink.click()
  await expect(homeLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )
  await expect(aboutLink).toHaveClass(
    /border-b-4 border-sky-600 mx-1.5 sm:mx-6/
  )
  await expect(homeLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )

  // Navigate to Readme and verify state change
  await readmeLink.click()
  await expect(homeLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )
  await expect(aboutLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )
  await expect(readmeLink).toHaveClass(
    /border-b-4 border-sky-600 mx-1.5 sm:mx-6/
  )

  // Navigate back to Home and verify state change
  await homeLink.click()
  await expect(homeLink).toHaveClass(/border-b-4 border-sky-600 mx-1.5 sm:mx-6/)
  await expect(aboutLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )
  await expect(readmeLink).toHaveClass(
    /border-b-4 border-transparent hover:border-sky-600 mx-1.5 sm:mx-6/
  )
})

// 6. Confirm direct URL route access
test('should handle direct URL access to each route', async ({ page }) => {
  // Test direct access to home
  await page.goto('http://localhost:3000/')
  await expect(
    page.getByRole('heading', { name: /Hello SolidStart!/i })
  ).toBeVisible()

  // Test direct access to about
  await page.goto('http://localhost:3000/about')
  await expect(page.getByRole('heading', { name: /^About$/i })).toBeVisible()

  // Test direct access to readme
  await page.goto('http://localhost:3000/readme')
  await expect(page.getByRole('heading', { name: /^Readme$/i })).toBeVisible()

  // Test direct access to 404
  await page.goto('http://localhost:3000/xxx')
  await expect(
    page.getByRole('heading', { name: /^404 - Page Not Found$/i })
  ).toBeVisible()
})

// 7. Browser back and forward navigation
test('should handle browser back/forward navigation', async ({ page }) => {
  await page.goto('/')

  // Navigate forward using footer link
  await page
    .locator('footer')
    .getByRole('link', { name: /^About$/i })
    .click()
  await expect(page).toHaveURL('http://localhost:3000/about')

  // Navigate back
  await page.goBack()
  await expect(page).toHaveURL('http://localhost:3000/')
  await expect(
    page.getByRole('heading', { name: /Hello SolidStart!/i })
  ).toBeVisible()

  // Navigate forward again
  await page.goForward()
  await expect(page).toHaveURL('http://localhost:3000/about')
  await expect(page.getByRole('heading', { name: /^About$/i })).toBeVisible()
})

// 8. Footer component
test('should maintain footer component across all pages', async ({ page }) => {
  await page.goto('/')
  const footer = page.locator('footer')
  await expect(footer).toBeVisible()

  await page.goto('/about')
  await expect(footer).toBeVisible()

  await page.goto('/readme')
  await expect(footer).toBeVisible()

  await page.goto('/xxx')
  await expect(footer).toBeVisible()
})

// 9. Footer link navigation
test.describe('Footer Navigation Integration', () => {
  test('should navigate via footer links to expected pages', async ({
    page,
  }) => {
    // Start at home
    await page.goto('/')
    await expect(page).toHaveURL('http://localhost:3000/')
    await expect(
      page.getByRole('heading', { name: /Hello SolidStart!/i })
    ).toBeVisible()

    // Navigate to About using footer link
    await page
      .locator('footer')
      .getByRole('link', { name: /^About$/i })
      .click()
    await expect(page).toHaveURL('http://localhost:3000/about')
    await expect(page.getByRole('heading', { name: /^About$/i })).toBeVisible()

    // Navigate to Readme using footer link
    await page
      .locator('footer')
      .getByRole('link', { name: /^Readme$/i })
      .click()
    await expect(page).toHaveURL('http://localhost:3000/readme')
    await expect(page.getByRole('heading', { name: /^Readme$/i })).toBeVisible()

    // Navigate back to Home using footer link
    await page
      .locator('footer')
      .getByRole('link', { name: /^Home$/i })
      .click()
    await expect(page).toHaveURL('http://localhost:3000/')
    await expect(
      page.getByRole('heading', { name: /Hello SolidStart!/i })
    ).toBeVisible()
  })

  // 10. Footer link state
  test('should maintain correct footer link state during navigation', async ({
    page,
  }) => {
    // Start at Home page
    await page.goto('/')
    const homeLink = page
      .locator('footer')
      .getByRole('link', { name: /^Home$/i })
    await expect(homeLink).toBeVisible
    const aboutLink = page
      .locator('footer')
      .getByRole('link', { name: /^About$/i })
    await expect(aboutLink).toBeVisible
    const readmeLink = page
      .locator('footer')
      .getByRole('link', { name: /^Readme$/i })
    await expect(readmeLink).toBeVisible

    // Verify footer Home page link active/inactive styling
    await expect(homeLink).toHaveClass(/border-b-2 border-sky-600/)
    await expect(aboutLink).toHaveClass(/border-b-2 border-transparent/)
    await expect(readmeLink).toHaveClass(/border-b-2 border-transparent/)

    // Navigate to About page using footer link
    await page
      .locator('footer')
      .getByRole('link', { name: /^About$/i })
      .click()

    // Verify footer About page link active/inactive styling
    await expect(homeLink).toHaveClass(/border-b-2 border-transparent/)
    await expect(aboutLink).toHaveClass(/border-b-2 border-sky-600/)
    await expect(readmeLink).toHaveClass(/border-b-2 border-transparent/)

    // Navigate to Readme page using footer link
    await page
      .locator('footer')
      .getByRole('link', { name: /^Readme$/i })
      .click()

    // Verify footer About page link active/inactive styling
    await expect(homeLink).toHaveClass(/border-b-2 border-transparent/)
    await expect(aboutLink).toHaveClass(/border-b-2 border-transparent/)
    await expect(readmeLink).toHaveClass(/border-b-2 border-sky-600/)

    // Navigate to 404 page
    await page.goto('notfound')

    // Verify footer 404 page link active/inactive styling
    await expect(homeLink).toHaveClass(/border-b-2 border-transparent/)
    await expect(aboutLink).toHaveClass(/border-b-2 border-transparent/)
    await expect(readmeLink).toHaveClass(/border-b-2 border-transparent/)
  })

  // 11. Consistent Page title across footer link navigation
  test('should preserve page title across footer link navigation', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/SolidStart\+/)

    // Use footer Home link
    await page
      .locator('footer')
      .getByRole('link', { name: /^Home$/i })
      .click()
    await expect(page).toHaveTitle(/SolidStart\+/)

    // Use footer About link
    await page
      .locator('footer')
      .getByRole('link', { name: /^About$/i })
      .click()
    await expect(page).toHaveTitle(/SolidStart About/)

    // Use footer Readme link
    await page
      .locator('footer')
      .getByRole('link', { name: /^Readme$/i })
      .click()
    await expect(page).toHaveTitle(/SolidStart Readme/)

    // Use direct link to 404 page
    await page.goto('/notfound')
    await expect(page).toHaveTitle(/SolidStart 404/)
  })
})
