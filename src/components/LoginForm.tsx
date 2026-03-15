import { createSignal, Show } from 'solid-js'
import { useAuth } from './AuthContext'

export default function LoginForm() {
  const { login, error } = useAuth()
  const [loading, setLoading] = createSignal(false)

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setLoading(true)
    const form = e.target as HTMLFormElement
    const formData = new FormData(form)
    try {
      await login(
        formData.get('username') as string,
        formData.get('password') as string
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-4">
      <h2 class="text-xl font-bold">Login</h2>

      <Show when={error()}>
        <div class="rounded bg-red-100 p-2 text-red-700">{error()}</div>
      </Show>

      <div>
        <label for="username" class="block text-sm font-medium">Username</label>
        <input
          id="username"
          name="username"
          type="text"
          required
          value="demo1"
          class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>

      <div>
        <label for="password" class="block text-sm font-medium">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          value="welcome"
          class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>

      <button
        type="submit"
        disabled={loading()}
        class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading() ? 'Logging in...' : 'Login'}
      </button>
    </form>
  )
}
