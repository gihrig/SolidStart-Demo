import {
  createContext,
  useContext,
  createSignal,
  type ParentComponent,
} from 'solid-js'
import { backendRpc } from '~/lib/backend-rpc'

interface AuthContextValue {
  isAuthenticated: () => boolean
  username: () => string | null
  login: (username: string, password: string) => Promise<void>
  logoff: () => Promise<void>
  error: () => string | null
}

const AuthContext = createContext<AuthContextValue>()

export const AuthProvider: ParentComponent = (props) => {
  const [isAuthenticated, setIsAuthenticated] = createSignal(false)
  const [username, setUsername] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  const login = async (user: string, password: string) => {
    setError(null)
    try {
      await backendRpc.auth.login(user, password)
      setIsAuthenticated(true)
      setUsername(user)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
      throw e
    }
  }

  const logoff = async () => {
    try {
      await backendRpc.auth.logoff()
    } finally {
      setIsAuthenticated(false)
      setUsername(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, username, login, logoff, error }}
    >
      {props.children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
