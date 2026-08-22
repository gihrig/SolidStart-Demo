import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { renderHook } from "@solidjs/testing-library";
import { useWebSocket } from "./websocket";

// Mock WebSocket. `useWebSocket` connects from onMount, which renderHook fires by
// mounting the hook — so the socket appears at instances[0] with no public
// bootstrap, and reconnect/disconnect stay private.
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.();
  });

  // Test helpers
  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateError() {
    this.onerror?.();
  }
}

describe("useWebSocket", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    // Errors are logged at the socket boundary; keep the output quiet and assertable.
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    errorSpy.mockRestore();
  });

  it("connects to the WebSocket URL on mount", () => {
    renderHook(() => useWebSocket());
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe("ws://localhost:8080/ws");
  });

  it("sets connected to true when the socket opens", () => {
    const { result } = renderHook(() => useWebSocket());
    expect(result.connected()).toBe(false);

    MockWebSocket.instances[0].open();

    expect(result.connected()).toBe(true);
  });

  it("sets connected to false when the socket closes", () => {
    const { result } = renderHook(() => useWebSocket());
    const ws = MockWebSocket.instances[0];
    ws.open();
    expect(result.connected()).toBe(true);

    ws.close();

    expect(result.connected()).toBe(false);
  });

  it("calls onConvMsg with conv_id and msg for conv_msg events", () => {
    const onConvMsg = vi.fn();
    renderHook(() => useWebSocket({ onConvMsg }));
    const ws = MockWebSocket.instances[0];
    ws.open();

    const fakeMsg = { id: 42, conv_id: 7, content: "Hello" };
    ws.simulateMessage({ event_type: "conv_msg", channel: "conv:7", payload: fakeMsg });

    expect(onConvMsg).toHaveBeenCalledWith(7, fakeMsg);
  });

  it("does not call onConvMsg for non-conv_msg event types", () => {
    const onConvMsg = vi.fn();
    renderHook(() => useWebSocket({ onConvMsg }));
    const ws = MockWebSocket.instances[0];
    ws.open();

    ws.simulateMessage({ event_type: "agent_update", channel: "agent:1", payload: {} });

    expect(onConvMsg).not.toHaveBeenCalled();
  });

  it("sends subscribe with channel and id when the socket is open", () => {
    const { result } = renderHook(() => useWebSocket());
    const ws = MockWebSocket.instances[0];
    ws.open();

    result.subscribe("conv", 5);

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ action: "subscribe", channel: "conv", id: 5 }),
    );
  });

  it("sends unsubscribe with channel and id when the socket is open", () => {
    const { result } = renderHook(() => useWebSocket());
    const ws = MockWebSocket.instances[0];
    ws.open();

    result.unsubscribe("conv", 5);

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ action: "unsubscribe", channel: "conv", id: 5 }),
    );
  });

  it("reports socket errors through onError and logs them at the boundary", () => {
    const onError = vi.fn();
    renderHook(() => useWebSocket({ onError }));

    MockWebSocket.instances[0].simulateError();

    expect(onError).toHaveBeenCalledWith("WebSocket connection error");
    expect(errorSpy).toHaveBeenCalledWith("WebSocket connection error");
  });

  it("does not send subscribe when the socket is not open", () => {
    const { result } = renderHook(() => useWebSocket());
    // Do NOT open — readyState stays 0.

    result.subscribe("conv", 5);

    expect(MockWebSocket.instances[0].send).not.toHaveBeenCalled();
  });

  it("reconnects 3s after an unintended drop", () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useWebSocket());
      expect(MockWebSocket.instances).toHaveLength(1);

      MockWebSocket.instances[0].open();
      MockWebSocket.instances[0].close(); // the socket drops

      vi.advanceTimersByTime(3000);

      expect(MockWebSocket.instances).toHaveLength(2);
      expect(MockWebSocket.instances[1].url).toBe("ws://localhost:8080/ws");
    } finally {
      vi.useRealTimers();
    }
  });

  it("replays a pending subscription once the socket opens", () => {
    const { result } = renderHook(() => useWebSocket());
    const ws = MockWebSocket.instances[0];

    // Subscribing before open cannot send yet, but the intent is remembered.
    result.subscribe("conv", 5);
    expect(ws.send).not.toHaveBeenCalled();

    ws.open();

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ action: "subscribe", channel: "conv", id: 5 }),
    );
  });

  it("replays subscriptions onto the new socket after a reconnect", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useWebSocket());
      const first = MockWebSocket.instances[0];
      first.open();
      result.subscribe("conv", 5);
      expect(first.send).toHaveBeenCalledWith(
        JSON.stringify({ action: "subscribe", channel: "conv", id: 5 }),
      );

      first.close(); // unintended drop
      vi.advanceTimersByTime(3000);

      const second = MockWebSocket.instances[1];
      second.open();

      expect(second.send).toHaveBeenCalledWith(
        JSON.stringify({ action: "subscribe", channel: "conv", id: 5 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not replay a subscription that was unsubscribed before open", () => {
    const { result } = renderHook(() => useWebSocket());
    const ws = MockWebSocket.instances[0];

    result.subscribe("conv", 5);
    result.unsubscribe("conv", 5);

    ws.open();

    expect(ws.send).not.toHaveBeenCalledWith(
      JSON.stringify({ action: "subscribe", channel: "conv", id: 5 }),
    );
  });
});
