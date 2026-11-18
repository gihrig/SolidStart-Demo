import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { auth, authenticatedRpc, createRpcClient, publicRpc } from "./backend-rpc";

// Test credentials sourced from .env.test (VITE_-prefixed vars reach import.meta.env).
const TEST_USERNAME = import.meta.env.VITE_TEST_USERNAME;
const TEST_PASSWORD = import.meta.env.VITE_TEST_PASSWORD;

if (!TEST_USERNAME || !TEST_PASSWORD) {
  throw new Error("Missing VITE_TEST_USERNAME / VITE_TEST_PASSWORD — check frontend/.env.test");
}

// Helper to create a mock fetch response
function mockResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Unauthorized",
    json: vi.fn(() => Promise.resolve(body)),
  } as unknown as Response;
}

// Helper to build a successful RPC response envelope
function rpcSuccess<T>(data: T) {
  return { id: 1, jsonrpc: "2.0", result: { data } };
}

// Helper to build an RPC error response envelope
function rpcError(message: string, detail?: string) {
  return { id: 1, error: { message, data: detail ? { detail } : undefined } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// -- auth.login --

describe("auth.login", () => {
  it("posts username and pwd to /api/login and returns the response", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(mockResponse({ result: { success: true } })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await auth.login(TEST_USERNAME, TEST_PASSWORD);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ username: TEST_USERNAME, pwd: TEST_PASSWORD }),
      }),
    );
    expect(result).toEqual({ result: { success: true } });
  });

  it("throws the server error message on a 401", async () => {
    // The back-end's error body (lib-web mw_res_map.rs) for a failed login.
    const errorBody = {
      id: null,
      error: {
        message: "LOGIN_FAIL",
        data: { req_uuid: "550e8400-e29b-41d4-a716-446655440000", detail: null },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(mockResponse(errorBody, false, 401))),
    );

    await expect(auth.login("bad", "creds")).rejects.toThrow("LOGIN_FAIL");
  });

  it("throws generic message when error body cannot be parsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          json: vi.fn(() => Promise.reject(new SyntaxError("not json"))),
        } as unknown as Response),
      ),
    );

    await expect(auth.login("u", "p")).rejects.toThrow("Login failed: 500");
  });
});

// -- auth.logoff --

describe("auth.logoff", () => {
  it("posts logoff: true to /api/logoff and resolves", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(mockResponse({ result: { logged_off: true } })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(auth.logoff()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/logoff",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ logoff: true }),
      }),
    );
  });
});

// -- rpcCall (via the typed calls) --

describe("rpcCall core behaviour", () => {
  it("posts a JSON-RPC envelope to /api/rpc and returns result.data", async () => {
    const likeData = { id: 42, like_count: 3, liked: true };
    const fetchMock = vi.fn(() => Promise.resolve(mockResponse(rpcSuccess(likeData))));
    vi.stubGlobal("fetch", fetchMock);

    const result = await authenticatedRpc("get_post_like", { id: 42 });

    expect(result).toEqual(likeData);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rpc",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0] as any[])[1].body);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.method).toBe("get_post_like");
    expect(body.params).toEqual({ id: 42 });
    expect(typeof body.id).toBe("number");
  });

  it("throws on HTTP error (non-ok response)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(mockResponse({}, false, 500))),
    );

    await expect(publicRpc("list_categories")).rejects.toThrow("HTTP 500");
  });

  it("throws RPC error detail when response contains error with detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(mockResponse(rpcError("Method not found", "get_post_like not registered"))),
      ),
    );

    await expect(authenticatedRpc("get_post_like", { id: 1 })).rejects.toThrow(
      "get_post_like not registered",
    );
  });

  it("falls back to error.message when no detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(mockResponse(rpcError("Entity not found")))),
    );

    await expect(authenticatedRpc("get_post_like", { id: 1 })).rejects.toThrow("Entity not found");
  });

  it("numbers requests from 1, with an independent counter per client", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(mockResponse(rpcSuccess([]))));
    vi.stubGlobal("fetch", fetchMock);
    const first = createRpcClient();

    await first.publicRpc("list_categories");
    await first.publicRpc("list_categories");
    await createRpcClient().publicRpc("list_categories");

    const ids = fetchMock.mock.calls.map((call) => JSON.parse((call as any[])[1].body).id);
    expect(ids).toEqual([1, 2, 1]);
  });
});

// -- typed RPC calls (the RPC contract, ADR-0029) --

describe("authenticatedRpc / publicRpc", () => {
  it("publicRpc posts the method to /api/rpc-public, with no params for a list", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(mockResponse(rpcSuccess([]))));
    vi.stubGlobal("fetch", fetchMock);

    await publicRpc("list_categories");

    // The taxonomy is public, so it posts to /api/rpc-public (no auth), not /api/rpc.
    expect((fetchMock.mock.calls[0] as any[])[0]).toBe("/api/rpc-public");
    const body = JSON.parse((fetchMock.mock.calls[0] as any[])[1].body);
    expect(body.method).toBe("list_categories");
    expect(body).not.toHaveProperty("params");
  });

  // Each `@ts-expect-error` pins one `tsc` failure: if the call ever compiles,
  // the unused directive fails `tsc`. The function only type-checks; no test
  // calls it, so it sends no request.
  it("rejects a wrong call at compile time", () => {
    const typeChecks = async () => {
      // @ts-expect-error a wrong method name
      await publicRpc("get_posts", { id: 1 });
      // @ts-expect-error a wrong params shape
      await authenticatedRpc("get_post_like", { post_id: 2 });
      const posts = await publicRpc("list_posts");
      // @ts-expect-error a wrong result use: `list_posts` returns a list
      expect(posts.title).toBeUndefined();
      // @ts-expect-error a method on the wrong surface
      await publicRpc("get_post_like", { id: 2 });
      // @ts-expect-error a list's `filters` stay on the back-end (#176)
      await publicRpc("list_posts", { filters: [] });
    };
    expect(typeChecks).toBeTypeOf("function");
  });
});

// -- the back-end origin (ADR-0034) --

// The browser posts to its own origin, and the HTTPS edge routes `/api/*` to
// the back-end. SSR has no page origin, so it calls the back-end directly.
describe("on the server (SSR)", () => {
  afterEach(() => {
    vi.doUnmock("solid-js/web");
    vi.resetModules();
  });

  it("posts to the back-end at http://localhost:8080", async () => {
    vi.resetModules();
    // `isServer` is the only import backend-rpc.ts takes from solid-js/web. Not
    // loading the original keeps a second copy of Solid out of the reset registry.
    vi.doMock("solid-js/web", () => ({ isServer: true }));
    const server = await import("./backend-rpc");
    const fetchMock = vi.fn(() => Promise.resolve(mockResponse(rpcSuccess([]))));
    vi.stubGlobal("fetch", fetchMock);

    await server.publicRpc("list_categories");

    expect((fetchMock.mock.calls[0] as any[])[0]).toBe("http://localhost:8080/api/rpc-public");
  });
});
