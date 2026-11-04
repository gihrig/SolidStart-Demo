import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { auth, authenticatedRpc, backendRpc, createRpcClient, publicRpc } from "./backend-rpc";

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
  it("sends POST to /api/login with username and pwd", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(mockResponse({ result: { success: true } })));
    vi.stubGlobal("fetch", fetchMock);

    await auth.login(TEST_USERNAME, TEST_PASSWORD);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ username: TEST_USERNAME, pwd: TEST_PASSWORD }),
      }),
    );
  });

  it("returns the success response on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(mockResponse({ result: { success: true } }))),
    );

    const result = await auth.login(TEST_USERNAME, TEST_PASSWORD);

    expect(result).toEqual({ result: { success: true } });
  });

  it("throws with server error message on non-ok response", async () => {
    const errorBody = { error: { message: "invalid credentials" } };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(mockResponse(errorBody, false, 401))),
    );

    await expect(auth.login("bad", "creds")).rejects.toThrow("invalid credentials");
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
  it("sends POST to /api/logoff with logoff: true", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(mockResponse({ result: { logged_off: true } })));
    vi.stubGlobal("fetch", fetchMock);

    await auth.logoff();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/logoff",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ logoff: true }),
      }),
    );
  });

  it("does not throw on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(mockResponse({ result: { logged_off: true } }))),
    );

    await expect(auth.logoff()).resolves.toBeUndefined();
  });
});

// -- rpcCall (via the typed calls) --

describe("rpcCall core behaviour", () => {
  it("sends POST to /api/rpc with JSON-RPC envelope", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(mockResponse(rpcSuccess({ id: 1, like_count: 0, liked: false }))),
    );
    vi.stubGlobal("fetch", fetchMock);

    await authenticatedRpc("get_post_like", { id: 1 });

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
    expect(body.params).toEqual({ id: 1 });
    expect(typeof body.id).toBe("number");
  });

  it("returns result.data on success", async () => {
    const likeData = { id: 42, like_count: 3, liked: true };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(mockResponse(rpcSuccess(likeData)))),
    );

    const result = await authenticatedRpc("get_post_like", { id: 42 });

    expect(result).toEqual(likeData);
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

  it("numbers requests from 1 within a fresh client", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(mockResponse(rpcSuccess([]))));
    vi.stubGlobal("fetch", fetchMock);
    const client = createRpcClient();

    await client.publicRpc("list_categories");
    await client.publicRpc("list_categories");

    const id1 = JSON.parse((fetchMock.mock.calls[0] as any[])[1].body).id;
    const id2 = JSON.parse((fetchMock.mock.calls[1] as any[])[1].body).id;
    expect(id1).toBe(1);
    expect(id2).toBe(2);
  });

  it("gives each client an independent id counter", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(mockResponse(rpcSuccess([]))));
    vi.stubGlobal("fetch", fetchMock);

    await createRpcClient().publicRpc("list_categories");
    await createRpcClient().publicRpc("list_categories");

    const idA = JSON.parse((fetchMock.mock.calls[0] as any[])[1].body).id;
    const idB = JSON.parse((fetchMock.mock.calls[1] as any[])[1].body).id;
    expect(idA).toBe(1);
    expect(idB).toBe(1);
  });
});

// -- typed RPC calls (the RPC contract, ADR-0029) --

describe("authenticatedRpc / publicRpc", () => {
  it("authenticatedRpc posts the method and params to /api/rpc", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(mockResponse(rpcSuccess({ id: 2, like_count: 4, liked: true }))),
    );
    vi.stubGlobal("fetch", fetchMock);

    const like = await authenticatedRpc("get_post_like", { id: 2 });

    expect((fetchMock.mock.calls[0] as any[])[0]).toBe("/api/rpc");
    const body = JSON.parse((fetchMock.mock.calls[0] as any[])[1].body);
    expect(body.method).toBe("get_post_like");
    expect(body.params).toEqual({ id: 2 });
    expect(like).toEqual({ id: 2, like_count: 4, liked: true });
  });

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

// -- backendRpc unified export --

describe("backendRpc unified export", () => {
  it("exports auth and the typed calls", () => {
    expect(Object.keys(backendRpc).sort()).toEqual(["auth", "authenticatedRpc", "publicRpc"]);
  });
});
