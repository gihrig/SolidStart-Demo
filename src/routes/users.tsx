// src/routes/users.tsx
import { createResource, For, Show } from 'solid-js'
import { rpc, type User } from '~/lib/rpc-client'

export default function Users() {
  const [users] = createResource<User[]>(() => rpc.user.list({ limit: 50 }))

  const handleCreateUser = async (e: Event) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)

    try {
      const newUser = await rpc.user.create({
        email: formData.get('email') as string,
        name: formData.get('name') as string,
      })
      console.log('Created user:', newUser)
    } catch (error) {
      console.error('RPC error:', error)
    }
  }

  return (
    <div class="p-4">
      <h1 class="mb-4 text-2xl font-bold">Users</h1>

      <Show when={users.loading}>
        <p>Loading...</p>
      </Show>

      <Show when={users.error}>
        <p class="text-red-600">Error: {users.error.message}</p>
      </Show>

      <Show when={users()}>
        <ul class="space-y-2">
          <For each={users()}>
            {(user) => (
              <li class="rounded border p-2">
                {user.name} ({user.email})
              </li>
            )}
          </For>
        </ul>
      </Show>

      <form onSubmit={handleCreateUser} class="mt-4 space-y-2">
        <input name="name" placeholder="Name" required class="border p-2" />
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          class="border p-2"
        />
        <button type="submit" class="rounded bg-blue-500 px-4 py-2 text-white">
          Create User
        </button>
      </form>
    </div>
  )
}
