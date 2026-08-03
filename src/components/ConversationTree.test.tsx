import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import {
  makeAgent,
  makeConv,
  makeWorkspaceStub,
  readyResource,
} from "~/lib/conversationWorkspace.stub";
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
    render(() => (
      <ConversationTree ws={makeWorkspaceStub({ agents: readyResource([ada, bob]) })} />
    ));
    const adaHeader = screen.getByRole("button", { name: /ada/i });
    expect(adaHeader).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /bob/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("marks the open agent's header as expanded", () => {
    const ws = makeWorkspaceStub({ agents: readyResource([ada, bob]), selectedAgent: () => ada });
    render(() => <ConversationTree ws={ws} />);
    expect(screen.getByRole("button", { name: /ada/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /bob/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking an agent header calls selectAgent (accordion open/collapse)", async () => {
    const ws = makeWorkspaceStub({ agents: readyResource([ada, bob]) });
    const user = userEvent.setup();
    render(() => <ConversationTree ws={ws} />);
    await user.click(screen.getByRole("button", { name: /ada/i }));
    expect(ws.selectAgent).toHaveBeenCalledWith(ada);
  });

  it("shows the open agent's conversations as a single-select listbox", () => {
    const ws = makeWorkspaceStub({
      agents: readyResource([ada]),
      selectedAgent: () => ada,
      convs: readyResource([convAlpha, convBeta]),
      selectedConv: () => convBeta,
    });
    render(() => <ConversationTree ws={ws} />);
    expect(screen.getByRole("listbox", { name: /conversations/i })).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Conv Alpha", "Conv Beta"]);
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
      agents: readyResource([ada]),
      selectedAgent: () => ada,
      convs: readyResource([convAlpha]),
    });
    const user = userEvent.setup();
    render(() => <ConversationTree ws={ws} />);
    await user.click(screen.getByRole("option", { name: "Conv Alpha" }));
    expect(ws.selectConv).toHaveBeenCalledWith(convAlpha);
  });

  it("renders 'Untitled' for a conversation with no title", () => {
    const ws = makeWorkspaceStub({
      agents: readyResource([ada]),
      selectedAgent: () => ada,
      convs: readyResource([makeConv(12, "", 1)]),
    });
    render(() => <ConversationTree ws={ws} />);
    expect(screen.getByRole("option", { name: "Untitled" })).toBeInTheDocument();
  });

  it("offers Create Conversation only while an agent is open", () => {
    const closed = makeWorkspaceStub({ agents: readyResource([ada]) });
    const { unmount } = render(() => <ConversationTree ws={closed} />);
    expect(screen.queryByRole("button", { name: /create conversation/i })).not.toBeInTheDocument();
    unmount();

    const open = makeWorkspaceStub({ agents: readyResource([ada]), selectedAgent: () => ada });
    render(() => <ConversationTree ws={open} />);
    expect(screen.getByRole("button", { name: /create conversation/i })).toBeInTheDocument();
  });

  it("Create Agent lives at the navigator root regardless of open state", () => {
    render(() => <ConversationTree ws={makeWorkspaceStub({ agents: readyResource([ada]) })} />);
    const block = screen.getByRole("button", { name: /create agent/i }).closest("section");
    expect(block).toHaveAttribute("aria-label", "Create agent");
  });

  it("calls createAgent with the typed name and resets on success", async () => {
    const ws = makeWorkspaceStub({ agents: readyResource([]) });
    const user = userEvent.setup();
    render(() => <ConversationTree ws={ws} />);
    const input = screen.getByPlaceholderText(/agent name/i);
    await user.type(input, "Grace");
    await user.click(screen.getByRole("button", { name: /create agent/i }));
    expect(ws.createAgent).toHaveBeenCalledWith("Grace");
    expect(input).toHaveValue("");
  });

  it("calls createConv with the typed title (null when empty) and resets", async () => {
    const ws = makeWorkspaceStub({ agents: readyResource([ada]), selectedAgent: () => ada });
    const user = userEvent.setup();
    render(() => <ConversationTree ws={ws} />);
    await user.click(screen.getByRole("button", { name: /create conversation/i }));
    expect(ws.createConv).toHaveBeenCalledWith(null);
  });

  it("renders no raw numeric ids for agents or conversations", () => {
    const ws = makeWorkspaceStub({
      agents: readyResource([ada]),
      selectedAgent: () => ada,
      convs: readyResource([convAlpha]),
    });
    render(() => <ConversationTree ws={ws} />);
    // The old rows appended an "ID: <n>" label; assert that label is gone and
    // rows show only the domain name / title.
    expect(screen.queryByText(/ID:/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ada" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Conv Alpha" })).toBeInTheDocument();
  });

  it("surfaces the workspace's agent and conversation errors", () => {
    const agentErr = makeWorkspaceStub({ agents: readyResource([ada]), agentError: () => "boom" });
    const { unmount } = render(() => <ConversationTree ws={agentErr} />);
    expect(screen.getByText("boom")).toBeInTheDocument();
    unmount();

    const convErr = makeWorkspaceStub({
      agents: readyResource([ada]),
      selectedAgent: () => ada,
      convError: () => "conv boom",
    });
    render(() => <ConversationTree ws={convErr} />);
    expect(screen.getByText("conv boom")).toBeInTheDocument();
  });
});
