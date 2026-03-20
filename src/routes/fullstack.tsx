import { Title } from '@solidjs/meta'
import { createSignal, Show } from 'solid-js'
import { AuthProvider, useAuth } from '~/components/AuthContext'
import LoginForm from '~/components/LoginForm'
import AgentManager from '~/components/AgentManager'
import ConversationManager from '~/components/ConversationManager'
import MessagePanel from '~/components/MessagePanel'
import type { Agent, Conv } from '~/types/backend'

function FullstackContent() {
  const { isAuthenticated, username, logoff } = useAuth()
  const [selectedAgent, setSelectedAgent] = createSignal<Agent | null>(null)
  const [selectedConv, setSelectedConv] = createSignal<Conv | null>(null)

  const handleLogoff = async () => {
    await logoff()
    setSelectedAgent(null)
    setSelectedConv(null)
  }

  return (
    <main class="container mx-auto p-4">
      <h1 class="mb-6 text-2xl font-bold">Full-Stack Integration Demo</h1>
      <p class="mb-4 text-gray-400">
        SolidStart + Rust/Axum JSON-RPC Example (with WebSocket real-time
        updates)
      </p>

      <Show when={!isAuthenticated()}>
        <div class="mx-auto max-w-md">
          <LoginForm />
        </div>
      </Show>

      <Show when={isAuthenticated()}>
        <div class="mb-4 flex items-center justify-between">
          <span class="text-green-600">Logged in as: {username()}</span>
          <button
            onClick={handleLogoff}
            class="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
          >
            Logout
          </button>
        </div>

        <div class="grid gap-6 md:grid-cols-3">
          <div class="rounded border border-gray-200 p-4">
            <AgentManager onAgentSelect={setSelectedAgent} />
          </div>

          <div class="rounded border border-gray-200 p-4">
            <ConversationManager
              agent={selectedAgent()}
              onConvSelect={setSelectedConv}
            />
          </div>

          <div class="rounded border border-gray-200 p-4">
            <MessagePanel conv={selectedConv()} />
          </div>
        </div>
      </Show>
    </main>
  )
}

export default function Fullstack() {
  return (
    <AuthProvider>
      <Title>Full-Stack Demo | SolidStart+</Title>
      <FullstackContent />
    </AuthProvider>
  )
}
