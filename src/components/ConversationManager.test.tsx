import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import ConversationManager from "./ConversationManager";
import type { Agent, Conv } from "~/types/backend";

// Note: vi.mock is hoisted — factory must not reference outer variables
vi.mock("~/lib/backend-rpc", () => ({
  backendRpc: {
    conv: {
      list: vi.fn().mockResolvedValue([
        {
          id: BigInt(10),
          agent_id: BigInt(1),
          owner_id: BigInt(1),
          title: "Conv Alpha",
          kind: "OwnerOnly",
          state: "Active",
          cid: BigInt(1),
          ctime: "2024-01-01T00:00:00Z",
          mid: BigInt(1),
          mtime: "2024-01-01T00:00:00Z",
        },
        {
          id: BigInt(11),
          agent_id: BigInt(1),
          owner_id: BigInt(1),
          title: "Conv Beta",
          kind: "OwnerOnly",
          state: "Active",
          cid: BigInt(1),
          ctime: "2024-01-01T00:00:00Z",
          mid: BigInt(1),
          mtime: "2024-01-01T00:00:00Z",
        },
      ]),
      create: vi.fn().mockResolvedValue({
        id: BigInt(12),
        agent_id: BigInt(1),
        owner_id: BigInt(1),
        title: "New Conv",
        kind: "OwnerOnly",
        state: "Active",
        cid: BigInt(1),
        ctime: "2024-01-01T00:00:00Z",
        mid: BigInt(1),
        mtime: "2024-01-01T00:00:00Z",
      }),
    },
  },
}));

const mockAgent: Agent = {
  id: BigInt(1),
  owner_id: BigInt(1),
  name: "Test Agent",
  ai_provider: "openai",
  ai_model: "gpt-4",
  cid: BigInt(1),
  ctime: "2024-01-01T00:00:00Z",
  mid: BigInt(1),
  mtime: "2024-01-01T00:00:00Z",
};

const mockConvAlpha: Conv = {
  id: BigInt(10),
  agent_id: BigInt(1),
  owner_id: BigInt(1),
  title: "Conv Alpha",
  kind: "OwnerOnly",
  state: "Active",
  cid: BigInt(1),
  ctime: "2024-01-01T00:00:00Z",
  mid: BigInt(1),
  mtime: "2024-01-01T00:00:00Z",
};

const mockConvBeta: Conv = {
  id: BigInt(11),
  agent_id: BigInt(1),
  owner_id: BigInt(1),
  title: "Conv Beta",
  kind: "OwnerOnly",
  state: "Active",
  cid: BigInt(1),
  ctime: "2024-01-01T00:00:00Z",
  mid: BigInt(1),
  mtime: "2024-01-01T00:00:00Z",
};

describe("<ConversationManager />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders heading and "Select an agent first" when agent is null', () => {
    render(() => <ConversationManager agent={null} />);
    expect(screen.getByText(/conversations/i)).toBeInTheDocument();
    expect(screen.getByText(/select an agent first/i)).toBeInTheDocument();
  });

  it("displays conversations after agent is provided", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      mockConvAlpha,
      mockConvBeta,
    ]);

    render(() => <ConversationManager agent={mockAgent} />);

    await waitFor(() => {
      expect(screen.getByText("Conv Alpha")).toBeInTheDocument();
      expect(screen.getByText("Conv Beta")).toBeInTheDocument();
    });
  });

  it("calls conv.create with correct params on form submit", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const user = userEvent.setup();

    render(() => <ConversationManager agent={mockAgent} />);

    await user.type(screen.getByPlaceholderText(/conversation title/i), "New Conv");
    await user.click(screen.getByRole("button", { name: /create conv/i }));

    expect(backendRpc.conv.create).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: BigInt(1), title: "New Conv" }),
    );
  });

  it("fires onConvSelect callback when a conversation is clicked", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue([mockConvAlpha]);
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(() => <ConversationManager agent={mockAgent} onConvSelect={onSelect} />);

    await waitFor(() => screen.getByText("Conv Alpha"));
    await user.click(screen.getByText("Conv Alpha"));

    expect(onSelect).toHaveBeenCalledWith(mockConvAlpha);
  });

  it("fires onConvSelect with the new Conv after successful create", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const newConv: Conv = { ...mockConvAlpha, id: BigInt(12), title: "New Conv" };
    (backendRpc.conv.create as ReturnType<typeof vi.fn>).mockResolvedValue(newConv);
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(() => <ConversationManager agent={mockAgent} onConvSelect={onSelect} />);

    await user.type(screen.getByPlaceholderText(/conversation title/i), "New Conv");
    await user.click(screen.getByRole("button", { name: /create conv/i }));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(newConv);
    });
  });

  it("shows error message when conv.create fails", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (backendRpc.conv.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );
    const user = userEvent.setup();

    render(() => <ConversationManager agent={mockAgent} />);

    await user.type(screen.getByPlaceholderText(/conversation title/i), "Failing Conv");
    await user.click(screen.getByRole("button", { name: /create conv/i }));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("resets conversation list when agent changes", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    (backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue([mockConvAlpha]);

    const [agent, setAgent] = createSignal<Agent | null>(mockAgent);
    render(() => <ConversationManager agent={agent()} />);

    await waitFor(() => screen.getByText("Conv Alpha"));

    const otherAgent: Agent = { ...mockAgent, id: BigInt(2), name: "Other Agent" };
    (backendRpc.conv.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    setAgent(otherAgent);

    await waitFor(() => {
      expect(screen.queryByText("Conv Alpha")).not.toBeInTheDocument();
    });
  });
});
