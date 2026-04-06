import {
  createSignal,
  createResource,
  For,
  Show,
} from 'solid-js'
import { backendRpc } from '~/lib/backend-rpc'
import type { Agent } from '~/types/backend'

interface Props {
  onAgentSelect?: (agent: Agent) => void
}

export default function AgentManager(props: Props) {
  const [agents, { refetch }] = createResource(() =>
    backendRpc.agent.list()
  )
  const [selectedAgent, setSelectedAgent] =
    createSignal<Agent | null>(null)
  const [creating, setCreating] = createSignal(false)
  const [error, setError] = createSignal<string | null>(
    null
  )

  const handleCreate = async (e: Event) => {
    e.preventDefault()
    setError(null)
    setCreating(true)
    const form = e.target as HTMLFormElement
    const formData = new FormData(form)

    try {
      const agent = await backendRpc.agent.create({
        name: formData.get('name') as string,
      })
      form.reset()
      await refetch()
      setSelectedAgent(agent)
      props.onAgentSelect?.(agent)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Failed to create agent'
      )
    } finally {
      setCreating(false)
    }
  }

  const selectAgent = (agent: Agent) => {
    setSelectedAgent(agent)
    props.onAgentSelect?.(agent)
  }

  return (
    <div class='space-y-4'>
      <h3 class='text-lg font-semibold'>Agents</h3>

      <Show when={error()}>
        <div class='rounded bg-red-100 p-2 text-red-700'>
          {error()}
        </div>
      </Show>

      {/* Create Agent Form */}
      <form
        onSubmit={handleCreate}
        class='flex flex-col gap-2'
      >
        <button
          type='submit'
          disabled={creating()}
          class='w-full rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50'
        >
          {creating() ? 'Creating...' : 'Create Agent'}
        </button>
        <input
          name='name'
          placeholder='Agent name'
          required
          class='w-full rounded border border-gray-300 px-3 py-2'
        />
      </form>

      {/* Agent List */}
      <Show when={agents.loading}>
        <p class='text-gray-500'>Loading agents...</p>
      </Show>

      <Show when={agents.error}>
        <p class='text-red-600'>
          Error loading agents: {agents.error.message}
        </p>
      </Show>

      <Show when={agents()}>
        <ul class='space-y-2'>
          <For
            each={agents()}
            fallback={
              <li class='text-gray-500'>No agents yet</li>
            }
          >
            {(agent) => (
              <li
                class={`cursor-pointer rounded border p-2 transition ${
                  selectedAgent()?.id === agent.id
                    ? 'border-blue-500 bg-auto'
                    : 'border-gray-200 hover:border-gray-400'
                }`}
                onClick={() => selectAgent(agent)}
              >
                <strong>{agent.name}</strong>
                <span class='ml-2 text-sm text-gray-500'>
                  ID: {String(agent.id)}
                </span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  )
}
