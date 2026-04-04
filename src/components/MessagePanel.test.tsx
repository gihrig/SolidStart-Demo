import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vite-plus/test'
import {
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import MessagePanel from './MessagePanel'
import type { Conv, ConvMsg } from '~/types/backend'

const mockConv: Conv = {
  id: BigInt(10),
  agent_id: BigInt(1),
  title: 'Test Conversation',
  kind: 'MultiMessages',
  state: 'Active',
}

// Default: disconnected
vi.mock('~/lib/websocket', () => ({
  useWebSocket: vi.fn(() => ({
    connected: () => false,
    error: () => null,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
  })),
}))

vi.mock('~/lib/backend-rpc', () => ({
  backendRpc: {
    convMsg: {
      add: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
    },
  },
}))

describe('<MessagePanel />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "Select a conversation" when conv is null', () => {
    render(() => <MessagePanel conv={null} />)
    expect(
      screen.getByText(/select a conversation/i)
    ).toBeInTheDocument()
  })

  it('shows Live indicator when WebSocket is connected', async () => {
    const { useWebSocket } = await import('~/lib/websocket')
    ;(
      useWebSocket as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce({
      connected: () => true,
      error: () => null,
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      disconnect: vi.fn(),
      reconnect: vi.fn(),
    })

    render(() => <MessagePanel conv={mockConv} />)
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('shows Offline indicator when WebSocket is disconnected', () => {
    render(() => <MessagePanel conv={mockConv} />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('calls convMsg.add with correct params on send', async () => {
    const { backendRpc } = await import('~/lib/backend-rpc')
    const newMsg: ConvMsg = {
      id: BigInt(102),
      conv_id: BigInt(10),
      role: 'user',
      content: 'Hello test',
    }
    ;(
      backendRpc.convMsg.add as ReturnType<typeof vi.fn>
    ).mockResolvedValue(newMsg)
    const user = userEvent.setup()

    render(() => <MessagePanel conv={mockConv} />)

    await user.type(
      screen.getByPlaceholderText(/type a message/i),
      'Hello test'
    )
    await user.click(
      screen.getByRole('button', { name: /send/i })
    )

    expect(backendRpc.convMsg.add).toHaveBeenCalledWith(
      expect.objectContaining({
        conv_id: BigInt(10),
        content: 'Hello test',
      })
    )
  })

  it('shows sent message in list after successful send', async () => {
    const { backendRpc } = await import('~/lib/backend-rpc')
    const newMsg: ConvMsg = {
      id: BigInt(102),
      conv_id: BigInt(10),
      role: 'user',
      content: 'Hello test',
    }
    ;(
      backendRpc.convMsg.add as ReturnType<typeof vi.fn>
    ).mockResolvedValue(newMsg)
    const user = userEvent.setup()

    render(() => <MessagePanel conv={mockConv} />)

    await user.type(
      screen.getByPlaceholderText(/type a message/i),
      'Hello test'
    )
    await user.click(
      screen.getByRole('button', { name: /send/i })
    )

    await waitFor(() => {
      expect(
        screen.getByText('Hello test')
      ).toBeInTheDocument()
    })
  })
})
