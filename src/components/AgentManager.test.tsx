import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { Agent } from "~/types/backend";
import {
  makeAgent,
  makeWorkspaceStub,
  readyResource,
  loadingResource,
} from "~/lib/conversationWorkspace.stub";
import AgentManager from "./AgentManager";

const agents = [makeAgent(1, "Test Agent 1"), makeAgent(2, "Test Agent 2")];

describe("<AgentManager /> (presentational)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Agents heading", () => {
    render(() => <AgentManager ws={makeWorkspaceStub()} />);
    expect(screen.getByRole("heading", { name: /agents/i })).toBeInTheDocument();
  });

  it("shows the loading state while the agents resource is pending", () => {
    render(() => <AgentManager ws={makeWorkspaceStub({ agents: loadingResource<Agent[]>() })} />);
    expect(screen.getByText(/loading agents/i)).toBeInTheDocument();
  });

  it("lists the agents from the workspace", () => {
    render(() => <AgentManager ws={makeWorkspaceStub({ agents: readyResource(agents) })} />);
    expect(screen.getByText("Test Agent 1")).toBeInTheDocument();
    expect(screen.getByText("Test Agent 2")).toBeInTheDocument();
  });

  it("calls ws.selectAgent with the clicked agent", async () => {
    const ws = makeWorkspaceStub({ agents: readyResource(agents) });
    const user = userEvent.setup();
    render(() => <AgentManager ws={ws} />);

    await user.click(screen.getByText("Test Agent 1"));

    expect(ws.selectAgent).toHaveBeenCalledWith(expect.objectContaining({ name: "Test Agent 1" }));
  });

  it("marks the selected agent's row", () => {
    const ws = makeWorkspaceStub({
      agents: readyResource(agents),
      selectedAgent: () => agents[1],
    });
    render(() => <AgentManager ws={ws} />);
    expect(screen.getByText("Test Agent 2").closest("li")).toHaveClass("border-blue-500");
    expect(screen.getByText("Test Agent 1").closest("li")).not.toHaveClass("border-blue-500");
  });

  it("submits the create form via ws.createAgent and resets it on success", async () => {
    const ws = makeWorkspaceStub();
    const user = userEvent.setup();
    render(() => <AgentManager ws={ws} />);

    const input = screen.getByPlaceholderText(/agent name/i);
    await user.type(input, "New Agent");
    await user.click(screen.getByRole("button", { name: /create agent/i }));

    expect(ws.createAgent).toHaveBeenCalledWith("New Agent");
    expect(input).toHaveValue(""); // form.reset() ran because createAgent resolved true
  });

  it("keeps the typed name when create fails", async () => {
    const ws = makeWorkspaceStub({ createAgent: vi.fn().mockResolvedValue(false) });
    const user = userEvent.setup();
    render(() => <AgentManager ws={ws} />);

    const input = screen.getByPlaceholderText(/agent name/i);
    await user.type(input, "Doomed");
    await user.click(screen.getByRole("button", { name: /create agent/i }));

    expect(ws.createAgent).toHaveBeenCalledWith("Doomed");
    expect(input).toHaveValue("Doomed"); // no reset on failure
  });

  it("shows the workspace's agent error", () => {
    render(() => <AgentManager ws={makeWorkspaceStub({ agentError: () => "Boom" })} />);
    expect(screen.getByText("Boom")).toBeInTheDocument();
  });
});
