import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import {
  makeAgent,
  makeConv,
  makeWorkspaceStub,
  readyResource,
} from "~/lib/conversationWorkspace.stub";
import WorkspaceLayout from "./WorkspaceLayout";

// MessagePanel opens a WebSocket feed by default; inject an inert fake so the
// layout renders without touching the network.
vi.mock("~/lib/backend-rpc", () => ({
  backendRpc: { convMsg: { add: vi.fn(), list: vi.fn().mockResolvedValue([]) } },
}));

// Stub the live socket so the embedded MessagePanel never dials a real WebSocket.
vi.mock("~/lib/websocket", () => ({
  useWebSocket: () => ({ connected: () => false, subscribe: vi.fn(), unsubscribe: vi.fn() }),
}));

function setupMatchMedia(mobile: boolean) {
  const mql = { matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return mql;
}

const ada = makeAgent(1, "Ada");
const convAlpha = makeConv(10, "Conv Alpha", 1);

// Solid sets `inert` as a DOM property (jsdom implements it) rather than a
// reflected attribute, so assert the property.
const navigator = () =>
  document.getElementById("conversation-navigator")! as HTMLElement & { inert: boolean };
const toggle = () => screen.getByRole("button", { name: /conversations/i });

describe("<WorkspaceLayout /> drawer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("mobile", () => {
    beforeEach(() => setupMatchMedia(true));

    it("starts collapsed: toggle aria-expanded false, navigator hidden and inert", () => {
      render(() => <WorkspaceLayout ws={makeWorkspaceStub({ agents: readyResource([ada]) })} />);
      expect(toggle()).toHaveAttribute("aria-expanded", "false");
      expect(navigator()).toHaveClass("hidden");
      expect(navigator().inert).toBe(true);
    });

    it("toggle opens the drawer: aria-expanded true, navigator shown and not inert", async () => {
      const user = userEvent.setup();
      render(() => <WorkspaceLayout ws={makeWorkspaceStub({ agents: readyResource([ada]) })} />);
      await user.click(toggle());
      expect(toggle()).toHaveAttribute("aria-expanded", "true");
      expect(navigator()).not.toHaveClass("hidden");
      expect(navigator().inert).toBe(false);
    });

    it("Escape closes the open drawer", async () => {
      const user = userEvent.setup();
      render(() => <WorkspaceLayout ws={makeWorkspaceStub({ agents: readyResource([ada]) })} />);
      await user.click(toggle());
      expect(toggle()).toHaveAttribute("aria-expanded", "true");

      await user.keyboard("{Escape}");

      expect(toggle()).toHaveAttribute("aria-expanded", "false");
      expect(navigator().inert).toBe(true);
    });

    it("selecting a conversation closes the drawer", async () => {
      const ws = makeWorkspaceStub({
        agents: readyResource([ada]),
        selectedAgent: () => ada,
        convs: readyResource([convAlpha]),
      });
      const user = userEvent.setup();
      render(() => <WorkspaceLayout ws={ws} />);
      await user.click(toggle());
      expect(toggle()).toHaveAttribute("aria-expanded", "true");

      await user.click(screen.getByRole("option", { name: "Conv Alpha" }));

      expect(ws.selectConv).toHaveBeenCalledWith(convAlpha);
      expect(toggle()).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("desktop", () => {
    beforeEach(() => setupMatchMedia(false));

    it("navigator is always shown and never inert; the toggle is mobile-only", () => {
      render(() => <WorkspaceLayout ws={makeWorkspaceStub({ agents: readyResource([ada]) })} />);
      expect(navigator()).toHaveClass("md:block");
      expect(navigator().inert).toBe(false);
      expect(toggle()).toHaveClass("md:hidden");
    });
  });
});
