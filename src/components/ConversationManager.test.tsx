import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import { createSignal } from 'solid-js'
import ConversationManager from './ConversationManager'
import type { Agent, Conv } from '~/types/backend'

const mockConvs: Conv[] = [
  { id: BigInt(10), agent_id: BigInt(1), title: 'Conv Alpha', kind: 'MultiMessages', state: 'Active' },
  { id: BigInt(11), agent_id: BigInt(1), title: 'Conv Beta',  kind: 'MultiMessages', state: 'Active' },
]

vi.mock('~/lib/backend-rpc', () => ({
  backendRpc: {
    conv: {
      list: vi.fn().mockResolvedValue(mockConvs),
      create: vi.fn().mockResolvedValue(
        { id: BigInt(12), agent_id: BigInt(1), title: 'New Conv', kind: 'MultiMessages', state: 'Active' }
      ),
    },
  },
}))

const mockAgent: Agent = { id: BigInt(1), name: 'Test Agent', model: null }

describe('<ConversationManager />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders heading and "Select an agent first" when agent is null', () => {
    render(() => <ConversationManager agent={null} />)
    expect(screen.getByText(/conversations/i)).toBeInTheDocument()
    expect(screen.getByText(/select an agent first/i)).toBeInTheDocument()
  })

  it('displays conversations after agent is provided', async () => {
    const { backendRpc } = await import('~/lib/backend-rpc')
    ;(backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockConvs)

    render(() => <ConversationManager agent={mockAgent} />)

    await waitFor(() => {
      expect(screen.getByText('Conv Alpha')).toBeInTheDocument()
      expect(screen.getByText('Conv Beta')).toBeInTheDocument()
    })
  })

  it('calls conv.create with correct params on form submit', async () => {
    const { backendRpc } = await import('~/lib/backend-rpc')
    ;(backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const user = userEvent.setup()

    render(() => <ConversationManager agent={mockAgent} />)

    await user.type(screen.getByPlaceholderText(/conversation title/i), 'New Conv')
    await user.click(screen.getByRole('button', { name: /create conv/i }))

    expect(backendRpc.conv.create).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: BigInt(1), title: 'New Conv' })
    )
  })

  it('fires onConvSelect callback when a conversation is clicked', async () => {
    const { backendRpc } = await import('~/lib/backend-rpc')
    ;(backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockConvs)
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(() => <ConversationManager agent={mockAgent} onConvSelect={onSelect} />)

    await waitFor(() => screen.getByText('Conv Alpha'))
    await user.click(screen.getByText('Conv Alpha'))

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ title: 'Conv Alpha' }))
  })

  it('resets conversation list when agent changes', async () => {
    const { backendRpc } = await import('~/lib/backend-rpc')
    ;(backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockConvs)

    const [agent, setAgent] = createSignal<Agent | null>(mockAgent)
    render(() => <ConversationManager agent={agent()} />)

    await waitFor(() => screen.getByText('Conv Alpha'))

    ;(backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
    setAgent({ id: BigInt(2), name: 'Other Agent', model: null })

    await waitFor(() => {
      expect(screen.queryByText('Conv Alpha')).not.toBeInTheDocument()
    })
  })
})
