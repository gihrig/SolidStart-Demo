import { describe, it, expect, vi } from "vite-plus/test";
import { createRoot } from "solid-js";
import { createDraftGuard, type DraftGuard } from "./createDraftGuard";

// The app-level Draft guard (ADR-0030): forms report yes or no, and every
// user-started move goes through `attempt`.

// Two forms' keys, as `useDraft` makes them.
const compose = Symbol("compose");
const edit1 = Symbol("edit-1");

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
