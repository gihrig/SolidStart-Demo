import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import { render, screen } from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import LoginForm from './LoginForm'
import { AuthProvider } from './AuthContext'

// Mock the backend RPC module
vi.mock('~/lib/backend-rpc', () => ({
  backendRpc: {
    auth: {
      login: vi.fn(),
      logoff: vi.fn(),
    },
  },
}))

const renderWithAuth = () => {
  return render(() => (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  ))
}

describe('<LoginForm />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders login form with username and password fields', () => {
    renderWithAuth()

    expect(screen.getByRole('heading', { name: /login/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument()
  })

  it('has default demo credentials pre-filled', () => {
    renderWithAuth()

    const usernameInput = screen.getByLabelText(/username/i) as HTMLInputElement
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement

    expect(usernameInput.value).toBe('demo1')
    expect(passwordInput.value).toBe('welcome')
  })

  it('submits form with entered credentials', async () => {
    const { backendRpc } = await import('~/lib/backend-rpc')
    const user = userEvent.setup()
    renderWithAuth()

    const usernameInput = screen.getByLabelText(/username/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /login/i })

    await user.clear(usernameInput)
    await user.type(usernameInput, 'testuser')
    await user.clear(passwordInput)
    await user.type(passwordInput, 'testpass')
    await user.click(submitButton)

    expect(backendRpc.auth.login).toHaveBeenCalledWith('testuser', 'testpass')
  })
})
