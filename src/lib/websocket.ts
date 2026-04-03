import { createSignal, onCleanup, onMount } from 'solid-js'
import type { WsMessage, ConvMsg } from '~/types/backend'

const WS_URL = 'ws://localhost:8080/ws'

interface UseWebSocketOptions {
  onConvMsg?: (convId: number, msg: ConvMsg) => void
  onError?: (error: string) => void
  autoReconnect?: boolean
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [connected, setConnected] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  let ws: WebSocket | null = null
  let reconnectTimeout: number | null = null

  const connect = () => {
    try {
      ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        setConnected(true)
        setError(null)
      }

      ws.onclose = () => {
        setConnected(false)
        if (options.autoReconnect !== false) {
          reconnectTimeout = window.setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        setError('WebSocket connection error')
        options.onError?.('WebSocket connection error')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WsMessage
          if (data.event_type === 'conv_msg' && options.onConvMsg) {
            const msg = data.payload as ConvMsg
            options.onConvMsg(Number(msg.conv_id), msg)
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e)
        }
      }
    } catch (e) {
      setError('Failed to connect to WebSocket')
    }
  }

  const subscribe = (channel: string, id?: number | bigint) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          action: 'subscribe',
          channel,
          id: id ? Number(id) : undefined,
        })
      )
    }
  }

  const unsubscribe = (channel: string, id?: number | bigint) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          action: 'unsubscribe',
          channel,
          id: id ? Number(id) : undefined,
        })
      )
    }
  }

  const disconnect = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
    }
    ws?.close()
    ws = null
  }

  onMount(connect)
  onCleanup(disconnect)

  return {
    connected,
    error,
    subscribe,
    unsubscribe,
    disconnect,
    reconnect: connect,
  }
}
