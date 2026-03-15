import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Helper to create a mock fetch response
function mockResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Unauthorized',
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

// Helper to build a successful RPC response envelope
function rpcSuccess<T>(data: T) {
  return { id: 1, jsonrpc: '2.0', result: { data } }
}

// Helper to build an RPC error response envelope
function rpcError(message: string, detail?: string) {
  return { id: 1, error: { message, data: detail ? { detail } : undefined } }
}

describe('backend-rpc', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    // Reset module state (rpcId counter) between tests
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // -- auth.login --

  describe('auth.login', () => {
    it('sends POST to /api/login with username and pwd', async () => {
      fetchMock.mockResolvedValue(mockResponse({ result: { success: true } }))
      const { auth } = await import('./backend-rpc')

      await auth.login('demo1', 'welcome')

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8080/api/login',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ username: 'demo1', pwd: 'welcome' }),
        })
      )
    })

    it('returns the success response on 200', async () => {
      fetchMock.mockResolvedValue(mockResponse({ result: { success: true } }))
      const { auth } = await import('./backend-rpc')

      const result = await auth.login('demo1', 'welcome')

      expect(result).toEqual({ result: { success: true } })
    })

    it('throws with server error message on non-ok response', async () => {
      const errorBody = { error: { message: 'invalid credentials' } }
      fetchMock.mockResolvedValue(mockResponse(errorBody, false, 401))
      const { auth } = await import('./backend-rpc')

      await expect(auth.login('bad', 'creds')).rejects.toThrow('invalid credentials')
    })

    it('throws generic message when error body cannot be parsed', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockRejectedValue(new SyntaxError('not json')),
      } as unknown as Response)
      const { auth } = await import('./backend-rpc')

      await expect(auth.login('u', 'p')).rejects.toThrow('Login failed: 500')
    })
  })

  // -- auth.logoff --

  describe('auth.logoff', () => {
    it('sends POST to /api/logoff with logoff: true', async () => {
      fetchMock.mockResolvedValue(mockResponse({ result: { logged_off: true } }))
      const { auth } = await import('./backend-rpc')

      await auth.logoff()

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8080/api/logoff',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ logoff: true }),
        })
      )
    })

    it('does not throw on success', async () => {
      fetchMock.mockResolvedValue(mockResponse({ result: { logged_off: true } }))
      const { auth } = await import('./backend-rpc')

      await expect(auth.logoff()).resolves.toBeUndefined()
    })
  })

  // -- rpcCall (via agent methods) --

  describe('rpcCall core behaviour', () => {
    it('sends POST to /api/rpc with JSON-RPC envelope', async () => {
      const agentData = { id: 1, name: 'Test Agent' }
      fetchMock.mockResolvedValue(mockResponse(rpcSuccess(agentData)))
      const { agent } = await import('./backend-rpc')

      await agent.create({ name: 'Test Agent' })

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8080/api/rpc',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        })
      )
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.jsonrpc).toBe('2.0')
      expect(body.method).toBe('create_agent')
      expect(body.params).toEqual({ data: { name: 'Test Agent' } })
      expect(typeof body.id).toBe('number')
    })

    it('returns result.data on success', async () => {
      const agentData = { id: 42, name: 'My Agent' }
      fetchMock.mockResolvedValue(mockResponse(rpcSuccess(agentData)))
      const { agent } = await import('./backend-rpc')

      const result = await agent.create({ name: 'My Agent' })

      expect(result).toEqual(agentData)
    })

    it('throws on HTTP error (non-ok response)', async () => {
      fetchMock.mockResolvedValue(mockResponse({}, false, 500))
      const { agent } = await import('./backend-rpc')

      await expect(agent.list()).rejects.toThrow('HTTP 500')
    })

    it('throws RPC error detail when response contains error', async () => {
      fetchMock.mockResolvedValue(mockResponse(rpcError('Method not found', 'create_agent not registered')))
      const { agent } = await import('./backend-rpc')

      await expect(agent.create({ name: 'X' })).rejects.toThrow('create_agent not registered')
    })

    it('falls back to error.message when no detail', async () => {
      fetchMock.mockResolvedValue(mockResponse(rpcError('Entity not found')))
      const { agent } = await import('./backend-rpc')

      await expect(agent.get(1)).rejects.toThrow('Entity not found')
    })

    it('serializes BigInt values as numbers', async () => {
      fetchMock.mockResolvedValue(mockResponse(rpcSuccess({ id: 1, name: 'A' })))
      const { agent } = await import('./backend-rpc')

      await agent.get(BigInt(9007199254740991))

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      // BigInt converted to Number — should be a plain JS number in the body
      expect(typeof body.params.id).toBe('number')
    })

    it('increments the RPC id with each call', async () => {
      fetchMock.mockResolvedValue(mockResponse(rpcSuccess([])))
      const { agent } = await import('./backend-rpc')

      await agent.list()
      await agent.list()

      const id1 = JSON.parse(fetchMock.mock.calls[0][1].body).id
      const id2 = JSON.parse(fetchMock.mock.calls[1][1].body).id
      expect(id2).toBe(id1 + 1)
    })
  })

  // -- agent methods --

  describe('agent', () => {
    it('agent.get sends get_agent with numeric id', async () => {
      fetchMock.mockResolvedValue(mockResponse(rpcSuccess({ id: 5, name: 'A' })))
      const { agent } = await import('./backend-rpc')

      await agent.get(5)

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.method).toBe('get_agent')
      expect(body.params).toEqual({ id: 5 })
    })

    it('agent.list sends list_agents', async () => {
      fetchMock.mockResolvedValue(mockResponse(rpcSuccess([])))
      const { agent } = await import('./backend-rpc')

      await agent.list()

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.method).toBe('list_agents')
    })

    it('agent.update sends update_agent with id and data', async () => {
      fetchMock.mockResolvedValue(mockResponse(rpcSuccess({ id: 3, name: 'Updated' })))
      const { agent } = await import('./backend-rpc')

      await agent.update(3, { name: 'Updated' })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.method).toBe('update_agent')
      expect(body.params).toEqual({ id: 3, data: { name: 'Updated' } })
    })

    it('agent.delete sends delete_agent with id', async () => {
      fetchMock.mockResolvedValue(mockResponse(rpcSuccess({ id: 3 })))
      const { agent } = await import('./backend-rpc')

      await agent.delete(3)

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.method).toBe('delete_agent')
      expect(body.params).toEqual({ id: 3 })
    })
  })

  // -- conv methods --

  describe('conv', () => {
    it('conv.create sends create_conv', async () => {
      fetchMock.mockResolvedValue(mockResponse(rpcSuccess({ id: 10 })))
      const { conv } = await import('./backend-rpc')

      await conv.create({ agent_id: 1, title: 'My Conv' })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.method).toBe('create_conv')
      expect(body.params).toEqual({ data: { agent_id: 1, title: 'My Conv' } })
    })

    it('conv.list sends list_convs', async () => {
      fetchMock.mockResolvedValue(mockResponse(rpcSuccess([])))
      const { conv } = await import('./backend-rpc')

      await conv.list({ agent_id: 1 })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.method).toBe('list_convs')
      expect(body.params).toEqual({ filters: { agent_id: 1 } })
    })

    it('conv.update sends update_conv', async () => {
      fetchMock.mockResolvedValue(mockResponse(rpcSuccess({ id: 10 })))
      const { conv } = await import('./backend-rpc')

      await conv.update(10, { title: 'Renamed' })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.method).toBe('update_conv')
      expect(body.params).toEqual({ id: 10, data: { title: 'Renamed' } })
    })

    it('conv.delete sends delete_conv', async () => {
      fetchMock.mockResolvedValue(mockResponse(rpcSuccess({ id: 10 })))
      const { conv } = await import('./backend-rpc')

      await conv.delete(10)

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.method).toBe('delete_conv')
      expect(body.params).toEqual({ id: 10 })
    })
  })

  // -- convMsg methods --

  describe('convMsg', () => {
    it('convMsg.add sends add_conv_msg with data', async () => {
      fetchMock.mockResolvedValue(mockResponse(rpcSuccess({ id: 100, content: 'Hello' })))
      const { convMsg } = await import('./backend-rpc')

      await convMsg.add({ conv_id: 10, content: 'Hello' })

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.method).toBe('add_conv_msg')
      expect(body.params).toEqual({ data: { conv_id: 10, content: 'Hello' } })
    })
  })

  // -- backendRpc unified export --

  describe('backendRpc unified export', () => {
    it('exports auth, agent, conv, and convMsg', async () => {
      const { backendRpc } = await import('./backend-rpc')

      expect(backendRpc).toHaveProperty('auth')
      expect(backendRpc).toHaveProperty('agent')
      expect(backendRpc).toHaveProperty('conv')
      expect(backendRpc).toHaveProperty('convMsg')
    })
  })
})
