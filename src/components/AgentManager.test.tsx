import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import AgentManager from "./AgentManager";

vi.mock("~/lib/backend-rpc", () => ({
  backendRpc: {
    agent: {
      list: vi.fn().mockResolvedValue([
        { id: BigInt(1), name: "Test Agent 1", owner_id: BigInt(1) },
        { id: BigInt(2), name: "Test Agent 2", owner_id: BigInt(1) },
      ]),
      create: vi.fn().mockResolvedValue({
        id: BigInt(3),
        name: "New Agent",
        owner_id: BigInt(1),
      }),
    },
  },
}));

describe("<AgentManager />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders agent list heading", () => {
    render(() => <AgentManager />);
    expect(screen.getByRole("heading", { name: /agents/i })).toBeInTheDocument();
  });

  it("displays loading state initially", () => {
    render(() => <AgentManager />);
    expect(screen.getByText(/loading agents/i)).toBeInTheDocument();
  });

  it("displays agents after loading", async () => {
    render(() => <AgentManager />);

    await waitFor(() => {
      expect(screen.getByText("Test Agent 1")).toBeInTheDocument();
      expect(screen.getByText("Test Agent 2")).toBeInTheDocument();
    });
  });

  it("calls onAgentSelect when agent is clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(() => <AgentManager onAgentSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText("Test Agent 1")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Test Agent 1"));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: "Test Agent 1" }));
  });

  it("creates new agent when form is submitted", async () => {
    const { backendRpc } = await import("~/lib/backend-rpc");
    const user = userEvent.setup();
    render(() => <AgentManager />);

    const input = screen.getByPlaceholderText(/agent name/i);
    const button = screen.getByRole("button", { name: /create agent/i });

    await user.type(input, "New Agent");
    await user.click(button);

    expect(backendRpc.agent.create).toHaveBeenCalledWith({ name: "New Agent" });
  });
});
