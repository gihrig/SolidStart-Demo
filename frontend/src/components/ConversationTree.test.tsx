import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { createSignal } from "solid-js";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { makeAgent, makeConv, makeWorkspaceStub } from "~/lib/conversationWorkspace.stub";
import type { Agent } from "~/types/backend";
import ConversationTree from "./ConversationTree";

const ada = makeAgent(1, "Ada");
const bob = makeAgent(2, "Bob");
const convAlpha = makeConv(10, "Conv Alpha", 1);
const convBeta = makeConv(11, "Conv Beta", 1);

describe("<ConversationTree /> (navigator)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders each agent as a collapsed disclosure header when none is open", () => {
    render(() => <ConversationTree ws={makeWorkspaceStub({ agents: () => [ada, bob] })} />);
    const adaHeader = screen.getByRole("button", { name: /ada/i });
    expect(adaHeader).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /bob/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("marks the open agent's header as expanded", () => {
    const ws = makeWorkspaceStub({ agents: () => [ada, bob], selectedAgent: () => ada });
    render(() => <ConversationTree ws={ws} />);
    expect(screen.getByRole("button", { name: /ada/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /bob/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking an agent header calls selectAgent (accordion open/collapse)", async () => {
    const ws = makeWorkspaceStub({ agents: () => [ada, bob] });
    const user = userEvent.setup();
    render(() => <ConversationTree ws={ws} />);
    await user.click(screen.getByRole("button", { name: /ada/i }));
    expect(ws.selectAgent).toHaveBeenCalledWith(ada);
  });

  it("shows the open agent's conversations as a single-select listbox", () => {
    const ws = makeWorkspaceStub({
      agents: () => [ada],
      selectedAgent: () => ada,
      convs: () => [convAlpha, convBeta],
      selectedConv: () => convBeta,
    });
    render(() => <ConversationTree ws={ws} />);
    expect(screen.getByRole("listbox", { name: /conversations/i })).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    // Each row now also holds an archive button, so assert the option's label
    // (its pinned accessible name) rather than raw textContent.
    expect(options.map((o) => o.getAttribute("aria-label"))).toEqual(["Conv Alpha", "Conv Beta"]);
    // The selected conversation is marked.
    expect(screen.getByRole("option", { name: "Conv Beta" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("option", { name: "Conv Alpha" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("clicking a conversation option calls selectConv", async () => {
    const ws = makeWorkspaceStub({
      agents: () => [ada],
      selectedAgent: () => ada,
      convs: () => [convAlpha],
    });
    const user = userEvent.setup();
    render(() => <ConversationTree ws={ws} />);
    await user.click(screen.getByRole("option", { name: "Conv Alpha" }));
    expect(ws.selectConv).toHaveBeenCalledWith(convAlpha);
  });

  it("renders 'Untitled' for a conversation with no title", () => {
    const ws = makeWorkspaceStub({
      agents: () => [ada],
      selectedAgent: () => ada,
      convs: () => [makeConv(12, "", 1)],
    });
    render(() => <ConversationTree ws={ws} />);
    expect(screen.getByRole("option", { name: "Untitled" })).toBeInTheDocument();
  });

  it("offers Create Conversation only while an agent is open", () => {
    const closed = makeWorkspaceStub({ agents: () => [ada] });
    const { unmount } = render(() => <ConversationTree ws={closed} />);
    expect(screen.queryByRole("button", { name: /create conversation/i })).not.toBeInTheDocument();
    unmount();

    const open = makeWorkspaceStub({ agents: () => [ada], selectedAgent: () => ada });
    render(() => <ConversationTree ws={open} />);
    expect(screen.getByRole("button", { name: /create conversation/i })).toBeInTheDocument();
  });

  it("Create Agent lives at the navigator root regardless of open state", () => {
    render(() => <ConversationTree ws={makeWorkspaceStub({ agents: () => [ada] })} />);
    const block = screen.getByRole("button", { name: /create agent/i }).closest("section");
    expect(block).toHaveAttribute("aria-label", "Create agent");
  });

  it("calls createAgent with the typed name and resets on success", async () => {
    const ws = makeWorkspaceStub({ agents: () => [] });
    const user = userEvent.setup();
    render(() => <ConversationTree ws={ws} />);
    const input = screen.getByPlaceholderText(/agent name/i);
    await user.type(input, "Grace");
    await user.click(screen.getByRole("button", { name: /create agent/i }));
    expect(ws.createAgent).toHaveBeenCalledWith("Grace");
    expect(input).toHaveValue("");
  });

  it("calls createConv with the typed title (null when empty) and resets", async () => {
    const ws = makeWorkspaceStub({ agents: () => [ada], selectedAgent: () => ada });
    const user = userEvent.setup();
    render(() => <ConversationTree ws={ws} />);
    await user.click(screen.getByRole("button", { name: /create conversation/i }));
    expect(ws.createConv).toHaveBeenCalledWith(null);
  });

  it("renders no raw numeric ids for agents or conversations", () => {
    const ws = makeWorkspaceStub({
      agents: () => [ada],
      selectedAgent: () => ada,
      convs: () => [convAlpha],
    });
    render(() => <ConversationTree ws={ws} />);
    // The old rows appended an "ID: <n>" label; assert that label is gone and
    // rows show only the domain name / title.
    expect(screen.queryByText(/ID:/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ada" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Conv Alpha" })).toBeInTheDocument();
  });

  it("scrolls the newly selected agent to the top of the list", async () => {
    // jsdom has no layout; provide scrollIntoView so we can observe the call
    // and which element it targeted.
    const scrollSpy = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollSpy;

    const [selected, setSelected] = createSignal<Agent | null>(null);
    const ws = makeWorkspaceStub({
      agents: () => [ada, bob],
      selectedAgent: selected,
      selectAgent: (a) => setSelected(a),
    });
    const user = userEvent.setup();
    render(() => <ConversationTree ws={ws} />);

    await user.click(screen.getByRole("button", { name: /bob/i }));

    expect(scrollSpy).toHaveBeenCalledWith({ block: "start" });
    // Called on Bob's row (the disclosure header's <li>), aligning it to the top.
    expect(scrollSpy.mock.instances[0]).toBe(
      screen.getByRole("button", { name: /bob/i }).closest("li"),
    );
  });

  it("surfaces the workspace's agent and conversation create-errors", () => {
    const agentErr = makeWorkspaceStub({ agents: () => [ada], createAgentError: () => "boom" });
    const { unmount } = render(() => <ConversationTree ws={agentErr} />);
    expect(screen.getByText("boom")).toBeInTheDocument();
    unmount();

    const convErr = makeWorkspaceStub({
      agents: () => [ada],
      selectedAgent: () => ada,
      createConvError: () => "conv boom",
    });
    render(() => <ConversationTree ws={convErr} />);
    expect(screen.getByText("conv boom")).toBeInTheDocument();
  });

  it("shows a loading notice while agents are loading", () => {
    render(() => <ConversationTree ws={makeWorkspaceStub({ agentsLoading: () => true })} />);
    expect(screen.getByText(/loading agents/i)).toBeInTheDocument();
  });

  it("surfaces the agent load-error text", () => {
    const ws = makeWorkspaceStub({ agentsError: () => "network down" });
    render(() => <ConversationTree ws={ws} />);
    expect(screen.getByText(/error loading agents: network down/i)).toBeInTheDocument();
  });

  it("shows a loading notice while the open agent's conversations load", () => {
    const ws = makeWorkspaceStub({
      agents: () => [ada],
      selectedAgent: () => ada,
      convsLoading: () => true,
    });
    render(() => <ConversationTree ws={ws} />);
    expect(screen.getByText(/loading conversations/i)).toBeInTheDocument();
  });

  it("surfaces the conversation load-error text", () => {
    const ws = makeWorkspaceStub({
      agents: () => [ada],
      selectedAgent: () => ada,
      convsError: () => "conv fetch failed",
    });
    render(() => <ConversationTree ws={ws} />);
    expect(screen.getByText(/error: conv fetch failed/i)).toBeInTheDocument();
  });

  describe("archive controls (#46)", () => {
    const archivedConv = makeConv(12, "Old Conv", 1, "Archived");

    it("shows an Archive button on an Active conversation and calls archiveConv", async () => {
      const ws = makeWorkspaceStub({
        agents: () => [ada],
        selectedAgent: () => ada,
        convs: () => [convAlpha],
      });
      const user = userEvent.setup();
      render(() => <ConversationTree ws={ws} />);
      await user.click(screen.getByRole("button", { name: /archive conv alpha/i }));
      expect(ws.archiveConv).toHaveBeenCalledWith(convAlpha);
      expect(ws.unarchiveConv).not.toHaveBeenCalled();
    });

    it("shows an Unarchive button on an Archived conversation and calls unarchiveConv", async () => {
      const ws = makeWorkspaceStub({
        agents: () => [ada],
        selectedAgent: () => ada,
        convs: () => [archivedConv],
        showArchived: () => true,
      });
      const user = userEvent.setup();
      render(() => <ConversationTree ws={ws} />);
      await user.click(screen.getByRole("button", { name: /unarchive old conv/i }));
      expect(ws.unarchiveConv).toHaveBeenCalledWith(archivedConv);
      expect(ws.archiveConv).not.toHaveBeenCalled();
    });

    it("clicking the archive button does not also select the conversation", async () => {
      const ws = makeWorkspaceStub({
        agents: () => [ada],
        selectedAgent: () => ada,
        convs: () => [convAlpha],
      });
      const user = userEvent.setup();
      render(() => <ConversationTree ws={ws} />);
      await user.click(screen.getByRole("button", { name: /archive conv alpha/i }));
      expect(ws.selectConv).not.toHaveBeenCalled();
    });

    it("keeps the option's accessible name as just the title", () => {
      const ws = makeWorkspaceStub({
        agents: () => [ada],
        selectedAgent: () => ada,
        convs: () => [convAlpha],
      });
      render(() => <ConversationTree ws={ws} />);
      expect(screen.getByRole("option", { name: "Conv Alpha" })).toBeInTheDocument();
    });

    it("reflects showArchived and calls toggleShowArchived on change", async () => {
      const ws = makeWorkspaceStub({
        agents: () => [ada],
        selectedAgent: () => ada,
        showArchived: () => false,
      });
      const user = userEvent.setup();
      render(() => <ConversationTree ws={ws} />);
      const toggle = screen.getByRole("checkbox", { name: /show archived/i });
      expect(toggle).not.toBeChecked();
      await user.click(toggle);
      expect(ws.toggleShowArchived).toHaveBeenCalled();
    });

    it("disables only the in-flight conversation's archive button", () => {
      const ws = makeWorkspaceStub({
        agents: () => [ada],
        selectedAgent: () => ada,
        convs: () => [convAlpha, convBeta],
        isArchiving: (id: number) => id === convAlpha.id,
      });
      render(() => <ConversationTree ws={ws} />);
      expect(screen.getByRole("button", { name: /archive conv alpha/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /archive conv beta/i })).not.toBeDisabled();
    });

    it("surfaces the archive error only on the row that failed", () => {
      const ws = makeWorkspaceStub({
        agents: () => [ada],
        selectedAgent: () => ada,
        convs: () => [convAlpha, convBeta],
        archiveError: (id: number) => (id === convAlpha.id ? "archive boom" : null),
      });
      render(() => <ConversationTree ws={ws} />);
      // The failed row shows the message; the other row does not.
      const alphaRow = screen.getByRole("option", { name: "Conv Alpha" });
      const betaRow = screen.getByRole("option", { name: "Conv Beta" });
      expect(alphaRow).toHaveTextContent("archive boom");
      expect(betaRow).not.toHaveTextContent("archive boom");
    });
  });
});
