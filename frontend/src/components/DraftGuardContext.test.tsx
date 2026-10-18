import { describe, it, expect, vi, beforeAll } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import { A, MemoryRouter, Route } from "@solidjs/router";
import userEvent from "@testing-library/user-event";
import { createSignal, Show } from "solid-js";
import { createDraftGuard, type DraftGuard } from "~/lib/createDraftGuard";
import { stubDialogModal } from "~/lib/test-utils";
import {
  DraftGuardContext,
  DraftGuardProvider,
  useDraft,
  useDraftGuard,
  type Draft,
} from "./DraftGuardContext";

describe("useDraft", () => {
  it("a cleared Draft stays released until the form is clean, so its close shows no notice (#187)", () => {
    // A Save clears the Draft, then closes the form. The close can re-run the
    // report before the saved text reloads, while `dirty()` is still true.
    const guard = createDraftGuard();
    const [open, setOpen] = createSignal(true);
    const [rerun, setRerun] = createSignal(0);
    const [dirty, setDirty] = createSignal(true);
    let draft!: Draft;
    function Form() {
      draft = useDraft({
        dirty: () => {
          rerun();
          return dirty();
        },
      });
      return null;
    }
    render(() => (
      <DraftGuardContext.Provider value={guard}>
        <Show when={open()}>
          <Form />
        </Show>
      </DraftGuardContext.Provider>
    ));
    expect(guard.hasDraft()).toBe(true);

    draft.clear();
    setRerun(1);
    expect(guard.hasDraft(), "a re-run does not hold it again").toBe(false);

    // Once the form is clean, a new change holds a Draft again.
    setDirty(false);
    setDirty(true);
    expect(guard.hasDraft()).toBe(true);
    draft.clear();
    setRerun(2);
    setOpen(false);
    expect(guard.notice()).toBeUndefined();
  });
});

describe("useDraft — the Cancel and the write (#214)", () => {
  function renderForm() {
    const guard = createDraftGuard();
    const [open, setOpen] = createSignal(true);
    const [dirty, setDirty] = createSignal(true);
    const [busy, setBusy] = createSignal(false);
    const scope = Symbol("panel");
    let draft!: Draft;
    function Form() {
      draft = useDraft({ dirty, busy, scope });
      return null;
    }
    render(() => (
      <DraftGuardContext.Provider value={guard}>
        <Show when={open()}>
          <Form />
        </Show>
      </DraftGuardContext.Provider>
    ));
    return { guard, draft, scope, setOpen, setDirty, setBusy };
  }

  it("cancel asks with a Draft; Discard runs the close, and the unmount shows no notice", () => {
    const { guard, draft, setOpen } = renderForm();
    const close = vi.fn(() => setOpen(false));
    draft.cancel(close);
    expect(guard.pending()).toBe(true);
    expect(close).not.toHaveBeenCalled();

    guard.confirmMove();
    expect(close).toHaveBeenCalledOnce();
    expect(guard.hasDraft()).toBe(false);
    expect(guard.notice()).toBeUndefined();
  });

  it("cancel without a Draft closes at once", () => {
    const { guard, draft, setDirty } = renderForm();
    setDirty(false);
    const close = vi.fn();
    draft.cancel(close);
    expect(close).toHaveBeenCalledOnce();
    expect(guard.pending()).toBe(false);
  });

  it("reports the write in its scope, and an unmount ends it", () => {
    const { guard, scope, setBusy, setOpen } = renderForm();
    expect(guard.busyIn([scope])).toBe(false);
    setBusy(true);
    expect(guard.busyIn([scope])).toBe(true);
    setOpen(false);
    expect(guard.busyIn()).toBe(false);
  });
});

describe("DraftGuardProvider — a route move during a write (#214)", () => {
  beforeAll(stubDialogModal);

  it("does nothing and asks nothing; the beforeunload listener stays on", async () => {
    let guard!: DraftGuard;
    const [busy, setBusy] = createSignal(true);
    function Form() {
      guard = useDraftGuard();
      useDraft({ dirty: () => true, busy });
      return <A href="/about">About</A>;
    }
    render(() => (
      <MemoryRouter root={(props) => <DraftGuardProvider>{props.children}</DraftGuardProvider>}>
        <Route path="/" component={Form} />
        <Route path="/about" component={() => <h1>About page</h1>} />
      </MemoryRouter>
    ));
    const user = userEvent.setup();

    await user.click(screen.getByRole("link", { name: "About" }));
    expect(screen.queryByRole("heading", { name: "About page" })).toBeNull();
    expect(guard.pending(), "no question").toBe(false);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    // After the write, the same move asks.
    setBusy(false);
    await user.click(screen.getByRole("link", { name: "About" }));
    expect(guard.pending()).toBe(true);
  });
});
