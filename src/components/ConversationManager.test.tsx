import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import {
  makeAgent,
  makeConv,
  makeWorkspaceStub,
  readyResource,
} from "~/lib/conversationWorkspace.stub";
import ConversationManager from "./ConversationManager";

const mockAgent = makeAgent(1, "Test Agent");
const convAlpha = makeConv(10, "Conv Alpha");
const convBeta = makeConv(11, "Conv Beta");

describe("<ConversationManager /> (presentational)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prompts to "Select an agent first" when no agent is selected', () => {
    render(() => <ConversationManager ws={makeWorkspaceStub({ selectedAgent: () => null })} />);
    expect(screen.getByText(/conversations/i)).toBeInTheDocument();
    expect(screen.getByText(/select an agent first/i)).toBeInTheDocument();
  });

  it("lists the conversations once an agent is selected", () => {
    const ws = makeWorkspaceStub({
      selectedAgent: () => mockAgent,
      convs: readyResource([convAlpha, convBeta]),
    });
    render(() => <ConversationManager ws={ws} />);
    expect(screen.getByText("Conv Alpha")).toBeInTheDocument();
    expect(screen.getByText("Conv Beta")).toBeInTheDocument();
  });

  it("calls ws.createConv with the typed title and resets on success", async () => {
    const ws = makeWorkspaceStub({ selectedAgent: () => mockAgent });
    const user = userEvent.setup();
    render(() => <ConversationManager ws={ws} />);

    const input = screen.getByPlaceholderText(/conversation title/i);
    await user.type(input, "New Conv");
    await user.click(screen.getByRole("button", { name: /create conv/i }));

    expect(ws.createConv).toHaveBeenCalledWith("New Conv");
    expect(input).toHaveValue("");
  });

  it("passes a null title when the field is left empty", async () => {
    const ws = makeWorkspaceStub({ selectedAgent: () => mockAgent });
    const user = userEvent.setup();
    render(() => <ConversationManager ws={ws} />);

    await user.click(screen.getByRole("button", { name: /create conv/i }));

    expect(ws.createConv).toHaveBeenCalledWith(null);
  });

  it("calls ws.selectConv with the clicked conversation", async () => {
    const ws = makeWorkspaceStub({
      selectedAgent: () => mockAgent,
      convs: readyResource([convAlpha]),
    });
    const user = userEvent.setup();
    render(() => <ConversationManager ws={ws} />);

    await user.click(screen.getByText("Conv Alpha"));

    expect(ws.selectConv).toHaveBeenCalledWith(convAlpha);
  });

  it("marks the selected conversation's row", () => {
    const ws = makeWorkspaceStub({
      selectedAgent: () => mockAgent,
      convs: readyResource([convAlpha, convBeta]),
      selectedConv: () => convBeta,
    });
    render(() => <ConversationManager ws={ws} />);
    expect(screen.getByText("Conv Beta").closest("li")).toHaveClass("border-blue-500");
    expect(screen.getByText("Conv Alpha").closest("li")).not.toHaveClass("border-blue-500");
  });

  it("shows the workspace's conversation error", () => {
    const ws = makeWorkspaceStub({
      selectedAgent: () => mockAgent,
      convError: () => "Network error",
    });
    render(() => <ConversationManager ws={ws} />);
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });
});
