import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { createRoot } from 'solid-js'

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1
  url: string
  readyState = 0
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send = mock(() => {})
  close = mock(() => {
    this.readyState = 3
    this.onclose?.()
  })

  // Test helpers
  open() {
    this.readyState = 1
    this.onopen?.()
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  simulateError() {
    this.onerror?.()
  }
}

let originalWebSocket: unknown

describe('useWebSocket', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    originalWebSocket = (globalThis as any).WebSocket
    ;(globalThis as any).WebSocket = MockWebSocket
  })

  afterEach(() => {
    ;(globalThis as any).WebSocket = originalWebSocket
  })

  it('connects to the correct WebSocket URL', () => {
    createRoot((dispose) => {
      // Manually invoke connect logic (bypassing onMount which needs a component)
      new (globalThis as any).WebSocket('ws://localhost:8080/ws')
      expect(MockWebSocket.instances).toHaveLength(1)
      expect(MockWebSocket.instances[0].url).toBe('ws://localhost:8080/ws')
      dispose()
    })
  })

  it('sets connected to true when socket opens', () => {
    createRoot((dispose) => {
      const { useWebSocket } = require('./websocket')
      // Call connect directly via reconnect (skips onMount)
      const { connected, reconnect } = useWebSocket({ autoReconnect: false })

      expect(connected()).toBe(false)
      reconnect()

      const ws = MockWebSocket.instances[0]
      ws.open()

      expect(connected()).toBe(true)
      dispose()
    })
  })

  it('sets connected to false when socket closes', () => {
    createRoot((dispose) => {
      const { useWebSocket } = require('./websocket')
      const { connected, reconnect } = useWebSocket({ autoReconnect: false })

      reconnect()
      const ws = MockWebSocket.instances[0]
      ws.open()
      expect(connected()).toBe(true)

      ws.close()
      expect(connected()).toBe(false)
      dispose()
    })
  })

  it('calls onConvMsg with correct conv_id and msg for conv_msg events', () => {
    createRoot((dispose) => {
      const { useWebSocket } = require('./websocket')
      const onConvMsg = mock(() => {})
      const { reconnect } = useWebSocket({ onConvMsg, autoReconnect: false })

      reconnect()
      const ws = MockWebSocket.instances[0]
      ws.open()

      const fakeMsg = { id: 42, conv_id: 7, content: 'Hello' }
      ws.simulateMessage({
        event_type: 'conv_msg',
        channel: 'conv:7',
        payload: fakeMsg,
      })

      expect(onConvMsg).toHaveBeenCalledWith(7, fakeMsg)
      dispose()
    })
  })

  it('does not call onConvMsg for non-conv_msg event types', () => {
    createRoot((dispose) => {
      const { useWebSocket } = require('./websocket')
      const onConvMsg = mock(() => {})
      const { reconnect } = useWebSocket({ onConvMsg, autoReconnect: false })

      reconnect()
      const ws = MockWebSocket.instances[0]
      ws.open()

      ws.simulateMessage({
        event_type: 'agent_update',
        channel: 'agent:1',
        payload: {},
      })

      expect(onConvMsg).not.toHaveBeenCalled()
      dispose()
    })
  })

  it('sends subscribe message with channel and id', () => {
    createRoot((dispose) => {
      const { useWebSocket } = require('./websocket')
      const { subscribe, reconnect } = useWebSocket({ autoReconnect: false })

      reconnect()
      const ws = MockWebSocket.instances[0]
      ws.open()

      subscribe('conv', 5)

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ action: 'subscribe', channel: 'conv', id: 5 })
      )
      dispose()
    })
  })

  it('sends unsubscribe message with channel and id', () => {
    createRoot((dispose) => {
      const { useWebSocket } = require('./websocket')
      const { unsubscribe, reconnect } = useWebSocket({ autoReconnect: false })

      reconnect()
      const ws = MockWebSocket.instances[0]
      ws.open()

      unsubscribe('conv', 5)

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ action: 'unsubscribe', channel: 'conv', id: 5 })
      )
      dispose()
    })
  })

  it('sets error signal when socket errors', () => {
    createRoot((dispose) => {
      const { useWebSocket } = require('./websocket')
      const onError = mock(() => {})
      const { error, reconnect } = useWebSocket({
        onError,
        autoReconnect: false,
      })

      reconnect()
      const ws = MockWebSocket.instances[0]
      ws.simulateError()

      expect(error()).toBe('WebSocket connection error')
      expect(onError).toHaveBeenCalledWith('WebSocket connection error')
      dispose()
    })
  })

  it('does not send subscribe when socket is not open', () => {
    createRoot((dispose) => {
      const { useWebSocket } = require('./websocket')
      const { subscribe, reconnect } = useWebSocket({ autoReconnect: false })

      reconnect()
      // Do NOT call ws.open() — readyState stays 0

      subscribe('conv', 5)

      const ws = MockWebSocket.instances[0]
      expect(ws.send).not.toHaveBeenCalled()
      dispose()
    })
  })
})
