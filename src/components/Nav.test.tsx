import { describe, it, expect } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import { Router } from '@solidjs/router'
import Nav from './Nav'

// Nav requires Router context for useLocation()
// Wrap component in Router with explicit current path
const renderWithRouter = (path: string = '/') => {
  return render(() => (
    <Router url={path}>
      <Nav />
    </Router>
  ))
}

describe('<Nav />', () => {
  it('renders navigation with Home and About links', () => {
    renderWithRouter()
    
    const nav = screen.getByRole('navigation')
    expect(nav).toBeInTheDocument()
    
    const homeLink = screen.getByRole('link', { name: 'Home' })
    const aboutLink = screen.getByRole('link', { name: 'About' })
    
    expect(homeLink).toHaveAttribute('href', '/')
    expect(aboutLink).toHaveAttribute('href', '/about')
  })

  it('applies active styling to Home link when on home path', () => {
    renderWithRouter('/')
    
    const homeLink = screen.getByRole('link', { name: 'Home' })
    const aboutLink = screen.getByRole('link', { name: 'About' })
    
    // Active link has sky-600 border, inactive has transparent
    expect(homeLink.parentElement).toHaveClass('border-sky-600')
    expect(aboutLink.parentElement).toHaveClass('border-transparent')
  })

  it('applies active styling to About link when on about path', () => {
    renderWithRouter('/about')
    
    const homeLink = screen.getByRole('link', { name: 'Home' })
    const aboutLink = screen.getByRole('link', { name: 'About' })
    
    expect(homeLink.parentElement).toHaveClass('border-transparent')
    expect(aboutLink.parentElement).toHaveClass('border-sky-600')
  })

  it('renders all links as inactive on unknown path', () => {
    renderWithRouter('/unknown')
    
    const homeLink = screen.getByRole('link', { name: 'Home' })
    const aboutLink = screen.getByRole('link', { name: 'About' })
    
    expect(homeLink.parentElement).toHaveClass('border-transparent')
    expect(aboutLink.parentElement).toHaveClass('border-transparent')
  })
})
