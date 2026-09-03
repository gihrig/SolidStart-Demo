import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { createSignal } from "solid-js";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import MessagePanel from "./MessagePanel";
import type { MessageFeedFactory, MessageFeedOptions } from "~/lib/websocket";
import { Channel } from "~/lib/channel";
import type { Conv, ConvMsg } from "~/types/backend";

const mockConv: Conv = {
  id: 10,
  agent_id: 1,
  owner_id: 1,
  title: "Test Conversation",
  kind: "OwnerOnly",
  state: "Active",
  cid: 1,
  ctime: "2024-01-01T00:00:00Z",
  mid: 1,
  mtime: "2024-01-01T00:00:00Z",
};

const msg = (id: number, content: string): ConvMsg => ({
  id,
  conv_id: 10,
  user_id: 1,
  content,
  cid: 1,
  ctime: "2024-01-01T00:00:00Z",
  mid: 1,
  mtime: "2024-01-01T00:00:00Z",
});

// In-memory feed adapter: lets a test emit conv_msg events through the port.
function createFakeFeed(connected = false) {
  const subscribe = vi.fn();
  const unsubscribe = vi.fn();
  let opts: MessageFeedOptions = {};
  const factory: MessageFeedFactory = (options) => {
    opts = options;
    return { connected: () => connected, subscribe, unsubscribe };
  };
  return {
    factory,
    subscribe,
    unsubscribe,
    emitConvMsg: (convId: number, m: ConvMsg) => opts.onConvMsg?.(convId, m),
    emitError: (e: string) => opts.onError?.(e),
  };
}

vi.mock("~/lib/backend-rpc", () => ({
  backendRpc: {
    convMsg: {
      add: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
    },
  },
}));

describe("<MessagePanel />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Select a conversation" when conv is null', () => {
    render(() => <MessagePanel conv={null} feed={createFakeFeed().factory} />);
    expect(screen.getByText(/select a conversation/i)).toBeInTheDocument();
  });

  it("shows Live indicator when the feed is connected", () => {
    render(() => <MessagePanel conv={mockConv} feed={createFakeFeed(true).factory} />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("shows Offline indicator when the feed is disconnected", () => {
    render(() => <MessagePanel conv={mockConv} feed={createFakeFeed(false).factory} />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("subscribes to the conversation channel on mount", async () => {
    const feed = createFakeFeed();
    render(() => <MessagePanel conv={mockConv} feed={feed.factory} />);
    await waitFor(() => expect(feed.subscribe).toHaveBeenCalledWith(Channel.conv(mockConv.id)));
  });

  it("unsubscribes from the previous conversation when conv changes", async () => {
    const feed = createFakeFeed();
    const otherConv: Conv = { ...mockConv, id: 20 };
    const [conv, setConv] = createSignal<Conv | null>(mockConv);
    render(() => <MessagePanel conv={conv()} feed={feed.factory} />);

    setConv(otherConv);

    await waitFor(() => expect(feed.unsubscribe).toHaveBeenCalledWith(Channel.conv(mockConv.id)));
  });

  it("calls convMsg.add with correct params on send", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.convMsg.add as ReturnType<typeof vi.fn>).mockResolvedValue(msg(102, "Hello test"));
    const user = userEvent.setup();

    render(() => <MessagePanel conv={mockConv} feed={createFakeFeed().factory} />);

    await user.type(screen.getByPlaceholderText(/type a message/i), "Hello test");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(backendRpc.convMsg.add).toHaveBeenCalledWith(
      expect.objectContaining({ conv_id: 10, content: "Hello test" }),
    );
  });

  it("shows sent message in list after successful send", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.convMsg.add as ReturnType<typeof vi.fn>).mockResolvedValue(msg(102, "Hello test"));
    const user = userEvent.setup();

    render(() => <MessagePanel conv={mockConv} feed={createFakeFeed().factory} />);

    await user.type(screen.getByPlaceholderText(/type a message/i), "Hello test");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(screen.getByText("Hello test")).toBeInTheDocument());
  });

  it("renders message content only — no numeric id label", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.convMsg.add as ReturnType<typeof vi.fn>).mockResolvedValue(msg(207, "hello there"));
    const user = userEvent.setup();

    const { container } = render(() => (
      <MessagePanel conv={mockConv} feed={createFakeFeed().factory} />
    ));

    await user.type(screen.getByPlaceholderText(/type a message/i), "hello there");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(screen.getByText("hello there")).toBeInTheDocument());

    // Row shows content only — the raw numeric id must not render anywhere.
    expect(container.textContent).not.toMatch(/ID:/i);
    expect(container.textContent).not.toMatch(/\b207\b/);
  });

  it("disables the button and shows 'Sending...' while a send is in flight", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    let resolveAdd!: (m: ConvMsg) => void;
    (backendRpc.convMsg.add as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise<ConvMsg>((r) => (resolveAdd = r)),
    );
    const user = userEvent.setup();

    render(() => <MessagePanel conv={mockConv} feed={createFakeFeed().factory} />);

    await user.type(screen.getByPlaceholderText(/type a message/i), "hi");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled());

    resolveAdd(msg(700, "hi"));
    await waitFor(() => expect(screen.getByRole("button", { name: /^send$/i })).toBeEnabled());
  });

  it("clears the input after a successful send", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.convMsg.add as ReturnType<typeof vi.fn>).mockResolvedValue(msg(701, "cleared"));
    const user = userEvent.setup();

    render(() => <MessagePanel conv={mockConv} feed={createFakeFeed().factory} />);

    const input = screen.getByPlaceholderText(/type a message/i) as HTMLInputElement;
    await user.type(input, "cleared");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(input.value).toBe(""));
  });

  it("keeps the input after a failed send", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.convMsg.add as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nope"));
    const user = userEvent.setup();

    render(() => <MessagePanel conv={mockConv} feed={createFakeFeed().factory} />);

    const input = screen.getByPlaceholderText(/type a message/i) as HTMLInputElement;
    await user.type(input, "kept");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(screen.getByText("nope")).toBeInTheDocument());
    expect(input.value).toBe("kept");
  });

  it("renders a message pushed through the feed for the current conversation", async () => {
    const feed = createFakeFeed(true);
    render(() => <MessagePanel conv={mockConv} feed={feed.factory} />);

    feed.emitConvMsg(10, msg(200, "live message"));

    await waitFor(() => expect(screen.getByText("live message")).toBeInTheDocument());
  });

  it("ignores feed messages for other conversations", async () => {
    const feed = createFakeFeed(true);
    render(() => <MessagePanel conv={mockConv} feed={feed.factory} />);

    feed.emitConvMsg(99, msg(201, "other conv"));

    await waitFor(() => expect(screen.getByText("No messages yet")).toBeInTheDocument());
    expect(screen.queryByText("other conv")).not.toBeInTheDocument();
  });

  it("dedupes a feed message that duplicates an id already shown", async () => {
    const feed = createFakeFeed(true);
    render(() => <MessagePanel conv={mockConv} feed={feed.factory} />);

    feed.emitConvMsg(10, msg(300, "once"));
    feed.emitConvMsg(10, msg(300, "once")); // same id → dedup guard

    await waitFor(() => expect(screen.getAllByText("once")).toHaveLength(1));
  });

  it("surfaces feed errors", async () => {
    const feed = createFakeFeed(true);
    render(() => <MessagePanel conv={mockConv} feed={feed.factory} />);

    feed.emitError("socket exploded");

    await waitFor(() => expect(screen.getByText("socket exploded")).toBeInTheDocument());
  });

  it("does not let a stale list response overwrite a just-sent message", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    // list resolves AFTER send, with stale contents that omit the sent message.
    let resolveList!: (msgs: ConvMsg[]) => void;
    (backendRpc.convMsg.list as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise<ConvMsg[]>((r) => (resolveList = r)),
    );
    (backendRpc.convMsg.add as ReturnType<typeof vi.fn>).mockResolvedValue(msg(400, "fresh"));
    const user = userEvent.setup();

    render(() => <MessagePanel conv={mockConv} feed={createFakeFeed().factory} />);

    await user.type(screen.getByPlaceholderText(/type a message/i), "fresh");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(screen.getByText("fresh")).toBeInTheDocument());

    // Late/stale history arrives; listStale guard must drop it.
    resolveList([msg(1, "stale history")]);

    await waitFor(() => expect(screen.getByText("fresh")).toBeInTheDocument());
    expect(screen.queryByText("stale history")).not.toBeInTheDocument();
  });
});
