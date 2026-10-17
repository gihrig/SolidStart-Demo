import { describe, it, expect, vi } from "vite-plus/test";
import { createRoot } from "solid-js";
import { createDraftGuard, type DraftGuard } from "./createDraftGuard";

// The app-level Draft guard (ADR-0030): forms report yes or no, and every
// user-started move goes through `attempt`.

// Two forms' keys, as `useDraft` makes them.
const compose = Symbol("compose");
const edit1 = Symbol("edit-1");
const caption = Symbol("caption");
// The scope of one panel's forms, and of one edit form.
const panel = Symbol("panel");
const captionEdit = Symbol("caption-edit");

function withGuard(run: (guard: DraftGuard) => void) {
  createRoot((dispose) => {
    try {
      run(createDraftGuard());
    } finally {
      dispose();
    }
  });
}

describe("createDraftGuard — attempt", () => {
  it("runs a move at once while no form holds a Draft", () =>
    withGuard((guard) => {
      const move = vi.fn();
      guard.attempt(move);
      expect(move).toHaveBeenCalledOnce();
      expect(guard.pending()).toBe(false);
    }));

  it("holds a move while a Draft exists, until confirmMove runs it", () =>
    withGuard((guard) => {
      const move = vi.fn();
      guard.report(compose, true);
      guard.attempt(move);
      expect(move).not.toHaveBeenCalled();
      expect(guard.pending()).toBe(true);

      guard.confirmMove();
      expect(move).toHaveBeenCalledOnce();
      expect(guard.pending()).toBe(false);
      expect(guard.hasDraft(), "Discard drops every Draft").toBe(false);
    }));

  it("cancelMove drops the waiting move and keeps the Draft", () =>
    withGuard((guard) => {
      const move = vi.fn();
      guard.report(compose, true);
      guard.attempt(move);

      guard.cancelMove();
      expect(guard.pending()).toBe(false);
      guard.confirmMove();
      expect(move).not.toHaveBeenCalled();
      expect(guard.hasDraft()).toBe(true);
    }));

  it("counts a Draft per key: one clean form does not clear another's Draft", () =>
    withGuard((guard) => {
      guard.report(compose, true);
      guard.report(edit1, true);
      guard.report(compose, false);
      expect(guard.hasDraft()).toBe(true);
      guard.report(edit1, false);
      expect(guard.hasDraft()).toBe(false);
    }));
});

describe("createDraftGuard — forced discard", () => {
  it("drops the Draft and shows the notice until it is dismissed", () =>
    withGuard((guard) => {
      guard.report(edit1, true);
      guard.discard(edit1, "This Comment was deleted.");
      expect(guard.hasDraft()).toBe(false);
      expect(guard.notice()).toBe("This Comment was deleted.");

      guard.dismissNotice();
      expect(guard.notice()).toBeUndefined();
    }));

  it("cancels a waiting move, so the user stays where they were", () =>
    withGuard((guard) => {
      const move = vi.fn();
      guard.report(edit1, true);
      guard.report(compose, true);
      guard.attempt(move);

      guard.discard(edit1, "This Comment was deleted.");
      expect(guard.pending()).toBe(false);
      guard.confirmMove();
      expect(move).not.toHaveBeenCalled();
      expect(guard.hasDraft(), "the other Draft stays").toBe(true);
    }));

  it("reports whether a key holds a Draft, so an unmount can tell a forced discard", () =>
    withGuard((guard) => {
      guard.report(edit1, true);
      expect(guard.holds(edit1)).toBe(true);
      guard.attempt(() => {});
      guard.confirmMove();
      expect(guard.holds(edit1)).toBe(false);
    }));
});

describe("createDraftGuard — beforeunload", () => {
  const unload = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event;
  };

  it("asks the browser to confirm a page unload only while a Draft exists", () =>
    withGuard((guard) => {
      expect(unload().defaultPrevented).toBe(false);
      guard.report(compose, true);
      expect(unload().defaultPrevented).toBe(true);
      guard.report(compose, false);
      expect(unload().defaultPrevented).toBe(false);
    }));

  it("stops listening when the guard's scope ends", () => {
    createRoot((dispose) => {
      createDraftGuard().report(compose, true);
      dispose();
    });
    expect(unload().defaultPrevented).toBe(false);
  });
});

describe("createDraftGuard — scopes", () => {
  it("a scoped move asks only about the Drafts in its scope", () =>
    withGuard((guard) => {
      const move = vi.fn();
      guard.report(caption, true);
      guard.attempt(move, [panel]);
      expect(move, "a Draft outside the scope").toHaveBeenCalledOnce();

      guard.report(compose, true, panel);
      guard.attempt(move, [panel]);
      expect(guard.pending()).toBe(true);
      guard.confirmMove();
      expect(move).toHaveBeenCalledTimes(2);
      expect(guard.holds(compose), "Discard drops the scope's Drafts").toBe(false);
      expect(guard.holds(caption), "and keeps the others").toBe(true);
    }));

  it("a move without a scope asks about every Draft, and Discard drops them all", () =>
    withGuard((guard) => {
      const move = vi.fn();
      guard.report(compose, true, panel);
      guard.attempt(move);
      expect(guard.pending()).toBe(true);
      guard.confirmMove();
      expect(move).toHaveBeenCalledOnce();
      expect(guard.hasDraft()).toBe(false);
    }));

  it("a move with two scopes asks about the Drafts in both, and Discard drops them", () =>
    withGuard((guard) => {
      const move = vi.fn();
      guard.report(edit1, true, captionEdit);
      guard.report(caption, true);
      guard.attempt(move, [captionEdit, panel]);
      expect(guard.pending(), "a Draft in the first scope").toBe(true);
      guard.cancelMove();

      guard.report(edit1, false, captionEdit);
      guard.report(compose, true, panel);
      guard.attempt(move, [captionEdit, panel]);
      expect(guard.pending(), "a Draft in the second scope").toBe(true);
      guard.report(edit1, true, captionEdit);
      guard.confirmMove();
      expect(move).toHaveBeenCalledOnce();
      expect(guard.holds(edit1), "Discard drops the first scope's Drafts").toBe(false);
      expect(guard.holds(compose), "and the second scope's").toBe(false);
      expect(guard.holds(caption), "and keeps the others").toBe(true);
    }));

  it("a panel close names one scope, so it asks only about that panel", () =>
    withGuard((guard) => {
      const move = vi.fn();
      guard.report(edit1, true, captionEdit);
      guard.attempt(move, [panel]);
      expect(move).toHaveBeenCalledOnce();
    }));

  it("hasDraftIn tells whether a Draft exists in any of the scopes", () =>
    withGuard((guard) => {
      guard.report(caption, true);
      expect(guard.hasDraftIn([panel, captionEdit])).toBe(false);
      guard.report(compose, true, panel);
      expect(guard.hasDraftIn([panel, captionEdit])).toBe(true);
      expect(guard.hasDraftIn([captionEdit])).toBe(false);
    }));

  it("hasDraftIn with no scope asks about every Draft", () =>
    withGuard((guard) => {
      expect(guard.hasDraftIn()).toBe(false);
      guard.report(caption, true);
      expect(guard.hasDraftIn()).toBe(true);
    }));
});

describe("createDraftGuard — the Owner's own delete (#187)", () => {
  it("release frees the Drafts in the scopes with no notice, and restore holds them again", () =>
    withGuard((guard) => {
      guard.report(compose, true, panel);
      guard.report(caption, true);
      const restore = guard.release([panel]);
      expect(guard.holds(compose), "the scope's Draft is released").toBe(false);
      expect(guard.holds(caption), "the other Draft stays").toBe(true);
      expect(guard.notice()).toBeUndefined();

      restore();
      expect(guard.holds(compose), "a failed delete holds it again").toBe(true);
    }));

  it("release with no scope releases every Draft", () =>
    withGuard((guard) => {
      guard.report(compose, true, panel);
      guard.report(caption, true);
      guard.release();
      expect(guard.hasDraft()).toBe(false);
    }));

  it("a released form that unmounts or ends its Draft is not held again", () =>
    withGuard((guard) => {
      guard.report(compose, true, panel);
      guard.report(edit1, true, panel);
      const restore = guard.release([panel]);
      guard.report(compose, false, panel);
      restore();
      expect(guard.holds(compose)).toBe(false);
      expect(guard.holds(edit1)).toBe(true);
    }));

  it("a released form keeps its Draft released while it types", () =>
    withGuard((guard) => {
      guard.report(compose, true, panel);
      guard.release([panel]);
      guard.report(compose, true, panel);
      expect(guard.hasDraft()).toBe(false);
    }));
});

describe("createDraftGuard — a forced discard of a scope (#187)", () => {
  it("drops the Drafts in the scopes, shows the notice and cancels a waiting move", () =>
    withGuard((guard) => {
      const move = vi.fn();
      guard.report(compose, true, panel);
      guard.report(caption, true);
      guard.attempt(move);

      expect(guard.discardIn([panel], "This Caption was deleted.")).toBe(true);
      expect(guard.holds(compose)).toBe(false);
      expect(guard.holds(caption)).toBe(true);
      expect(guard.notice()).toBe("This Caption was deleted.");
      expect(guard.pending()).toBe(false);
    }));

  it("with no Draft in the scopes, shows no notice and keeps a waiting move", () =>
    withGuard((guard) => {
      guard.report(caption, true);
      guard.attempt(() => {});
      expect(guard.discardIn([panel], "This Caption was deleted.")).toBe(false);
      expect(guard.notice()).toBeUndefined();
      expect(guard.pending()).toBe(true);
    }));

  it("with no scope, drops every Draft", () =>
    withGuard((guard) => {
      guard.report(compose, true, panel);
      guard.report(caption, true);
      expect(guard.discardIn(undefined, "This Post was deleted.")).toBe(true);
      expect(guard.hasDraft()).toBe(false);
    }));
});

describe("createDraftGuard — the question after an Event (#187)", () => {
  const T6 = "This Post is no longer in Animals. Your unsaved changes may not apply.";

  it("asks with its own message; Keep editing keeps the Drafts, Discard drops them", () =>
    withGuard((guard) => {
      expect(guard.question()).toBe("You have unsaved changes. Discard them?");
      guard.report(compose, true);
      guard.ask(T6);
      expect(guard.pending()).toBe(true);
      expect(guard.question()).toBe(T6);

      guard.cancelMove();
      expect(guard.hasDraft(), "Keep editing").toBe(true);
      guard.ask(T6);
      guard.confirmMove();
      expect(guard.hasDraft(), "Discard").toBe(false);
    }));

  it("cancels a waiting move", () =>
    withGuard((guard) => {
      const move = vi.fn();
      guard.report(compose, true);
      guard.attempt(move);
      guard.ask(T6);
      guard.confirmMove();
      expect(move).not.toHaveBeenCalled();
    }));

  it("does not ask without a Draft", () =>
    withGuard((guard) => {
      guard.ask(T6);
      expect(guard.pending()).toBe(false);
    }));

  it("a forced discard replaces the question", () =>
    withGuard((guard) => {
      guard.report(compose, true);
      guard.ask(T6);
      guard.discardIn(undefined, "This Post was deleted. Your unsaved changes were discarded.");
      expect(guard.pending()).toBe(false);
      expect(guard.notice()).toContain("This Post was deleted.");
    }));
});
