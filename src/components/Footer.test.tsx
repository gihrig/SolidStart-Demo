import { describe, it, expect } from 'vite-plus/test'
import { render, screen } from '@solidjs/testing-library'
import { MemoryRouter, Route, createMemoryHistory } from '@solidjs/router'
import Footer from './Footer'

// createMemoryHistory() - Creates an in-memory navigation history for testing
// history.set() - Sets the initial path before the router mounts
// MemoryRouter with custom history - Provides the router context
// Route with component={Footer} - Establishes the Route context that useLocation() requires

const renderWithRouter = (path: string = '/') => {
  const history = createMemoryHistory()
  history.set({ value: path, scroll: false, replace: true })

  return render(() => (
    <MemoryRouter history={history}>
      <Route path="*" component={Footer} />
    </MemoryRouter>
  ))
}

describe('<Footer />', () => {
  it('renders navigation with Home, About And Readme links', () => {
    renderWithRouter()

    const footer = screen.getByRole('contentinfo')
    expect(footer).toBeInTheDocument()

    const homeLink = screen.getByRole('link', { name: 'Home' })
    const aboutLink = screen.getByRole('link', { name: 'About' })
    const readmeLink = screen.getByRole('link', { name: 'ReadMe' })

    expect(homeLink).toHaveAttribute('href', '/')
    expect(aboutLink).toHaveAttribute('href', '/about')
    expect(readmeLink).toHaveAttribute('href', '/readme')
  })

  it('applies active styling to Home link when on home path', () => {
    renderWithRouter('/')

    const homeLink = screen.getByRole('link', { name: 'Home' })
    const aboutLink = screen.getByRole('link', { name: 'About' })
    const readmeLink = screen.getByRole('link', { name: 'ReadMe' })

    // Active link has sky-600 border, inactive has transparent
    expect(homeLink).toHaveClass('border-sky-600')
    expect(aboutLink).toHaveClass('border-transparent')
    expect(readmeLink).toHaveClass('border-transparent')
  })

  it('applies active styling to About link when on about path', () => {
    renderWithRouter('/about')

    const homeLink = screen.getByRole('link', { name: 'Home' })
    const aboutLink = screen.getByRole('link', { name: 'About' })
    const readmeLink = screen.getByRole('link', { name: 'ReadMe' })

    expect(homeLink).toHaveClass('border-transparent')
    expect(aboutLink).toHaveClass('border-sky-600')
    expect(readmeLink).toHaveClass('border-transparent')
  })

  it('renders all links as inactive on unknown path', () => {
    renderWithRouter('/unknown')

    const homeLink = screen.getByRole('link', { name: 'Home' })
    const aboutLink = screen.getByRole('link', { name: 'About' })
    const readmeLink = screen.getByRole('link', { name: 'About' })

    expect(homeLink).toHaveClass('border-transparent')
    expect(aboutLink).toHaveClass('border-transparent')
    expect(readmeLink).toHaveClass('border-transparent')
  })
})
