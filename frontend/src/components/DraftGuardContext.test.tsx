import { describe, it, expect, vi, beforeAll } from "vite-plus/test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { A, MemoryRouter, Route } from "@solidjs/router";
import userEvent from "@testing-library/user-event";
import { createSignal, Show } from "solid-js";
import { createDraftGuard, type DraftGuard } from "~/lib/createDraftGuard";
import { stubDialogModal } from "~/lib/test-utils";
import {
  DraftGuardContext,
  DraftGuardProvider,
  useDraft,
  useDraftForm,
  useDraftGuard,
  type Draft,
  type DraftForm,
  type DraftFormOptions,
} from "./DraftGuardContext";

// A write that a test settles by hand.
function deferredWrite<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const write = vi.fn(
    (_text: string) =>
      new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
  );
  return { write, resolve: (value: T) => resolve(value), reject: (e: unknown) => reject(e) };
}

/** A small test form on `useDraftForm`: one text field, Escape on the form. */
function renderDraftForm(
  options: Partial<DraftFormOptions<string, string | undefined>> & { cancels?: boolean } = {},
) {
  const { cancels = true, ...overrides } = options;
  const guard = createDraftGuard();
  const [open, setOpen] = createSignal(true);
  const [dirty, setDirty] = createSignal(true);
  const [rerun, setRerun] = createSignal(0);
  const scope = Symbol("panel");
  const { write, resolve, reject } = deferredWrite<string | undefined>();
  const close = vi.fn(() => setOpen(false));
  const onSaved = vi.fn();
  let form!: DraftForm<string>;
  function Form() {
    form = useDraftForm({
      dirty: () => {
        rerun();
        return dirty();
      },
      scope,
      close: () => (cancels ? close : undefined),
      write,
      fallbackError: "Could not save",
      onSaved,
      ...overrides,
    });
    return (
      <form on:keydown={form.keydown}>
        <input aria-label="Text" />
      </form>
    );
  }
  render(() => (
    <DraftGuardContext.Provider value={guard}>
      <Show when={open()}>
        <Form />
      </Show>
    </DraftGuardContext.Provider>
  ));
  const input = () => screen.getByRole("textbox", { name: "Text" });
  return {
    guard,
    form,
    scope,
    open,
    setOpen,
    setDirty,
    setRerun,
    write,
    resolve,
    reject,
    close,
    onSaved,
    input,
  };
}

describe("useDraftForm (#270)", () => {
  it("reports its Draft and its write in its scope; an unmount ends both", async () => {
    const { guard, form, scope, setDirty, setOpen, resolve } = renderDraftForm();
    expect(guard.hasDraftIn([scope])).toBe(true);
    setDirty(false);
    expect(guard.hasDraftIn([scope])).toBe(false);

    const done = form.submit("text");
    expect(form.pending()).toBe(true);
    expect(guard.busyIn([scope])).toBe(true);
    resolve("saved");
    await done;
    expect(form.pending()).toBe(false);
    expect(guard.busyIn([scope])).toBe(false);

    void form.submit("again");
    setOpen(false);
    expect(guard.busyIn()).toBe(false);
  });

  it("a Cancel with a Draft asks first; Discard runs the Cancel's step, and the unmount shows no notice", () => {
    const { guard, form, close, open } = renderDraftForm();
    form.cancel();
    expect(guard.pending()).toBe(true);
    expect(close).not.toHaveBeenCalled();

    guard.confirmMove();
    expect(close).toHaveBeenCalledOnce();
    expect(open()).toBe(false);
    expect(guard.hasDraft()).toBe(false);
    expect(guard.notice()).toBeUndefined();
  });

  it("a Cancel without a Draft runs the Cancel's step at once", () => {
    const { guard, form, close, setDirty } = renderDraftForm();
    setDirty(false);
    form.cancel();
    expect(close).toHaveBeenCalledOnce();
    expect(guard.pending()).toBe(false);
  });

  it("Escape is the Cancel: it asks first, and the form stops it", () => {
    const { guard, close, setDirty, input } = renderDraftForm();
    const outside = vi.fn();
    document.addEventListener("keydown", outside);
    try {
      expect(fireEvent.keyDown(input(), { key: "Escape" }), "default prevented").toBe(false);
      expect(guard.pending()).toBe(true);
      guard.cancelMove();

      setDirty(false);
      fireEvent.keyDown(input(), { key: "Escape" });
      expect(close).toHaveBeenCalledOnce();
      expect(outside, "a document listener does not hear it").not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", outside);
    }
  });

  it("a form without a Cancel ignores Escape, and still stops it", () => {
    const { guard, input } = renderDraftForm({ cancels: false });
    const outside = vi.fn();
    document.addEventListener("keydown", outside);
    try {
      expect(fireEvent.keyDown(input(), { key: "Escape" }), "default kept").toBe(true);
      expect(guard.pending()).toBe(false);
      expect(outside).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", outside);
    }
  });

  it("Escape does nothing while the write is in flight", () => {
    const { guard, form, close, input } = renderDraftForm();
    void form.submit("text");
    expect(fireEvent.keyDown(input(), { key: "Escape" })).toBe(true);
    expect(guard.pending()).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  it("an IME Escape is no Cancel: isComposing, and Safari's keyCode 229 (#251)", () => {
    const { guard, close, setDirty, input } = renderDraftForm();
    setDirty(false);
    expect(fireEvent.keyDown(input(), { key: "Escape", isComposing: true })).toBe(true);
    expect(fireEvent.keyDown(input(), { key: "Escape", isComposing: false, keyCode: 229 })).toBe(
      true,
    );
    expect(close).not.toHaveBeenCalled();
    expect(guard.pending()).toBe(false);
  });

  it("the escape option names what Escape runs in place of the Cancel (#210)", () => {
    const other = vi.fn();
    const [useOther, setUseOther] = createSignal(true);
    const { guard, close, input } = renderDraftForm({
      escape: (cancel) => (useOther() ? other : cancel),
    });
    expect(fireEvent.keyDown(input(), { key: "Escape" }), "default prevented").toBe(false);
    expect(other).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();

    setUseOther(false);
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(guard.pending(), "the Cancel asks").toBe(true);
  });

  it("an escape option that returns no action leaves the Escape alone", () => {
    const { guard, input } = renderDraftForm({ escape: () => undefined });
    expect(fireEvent.keyDown(input(), { key: "Escape" })).toBe(true);
    expect(guard.pending()).toBe(false);
  });

  it("a write that ends after the form unmounts changes nothing in the form", async () => {
    const { form, setOpen, resolve, onSaved } = renderDraftForm();
    const done = form.submit("text");
    setOpen(false);
    resolve("saved");
    await done;
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("a failed write shows its error and keeps the Draft", async () => {
    const { guard, form, reject, onSaved } = renderDraftForm();
    let done = form.submit("text");
    reject(new Error("The back-end refused it"));
    await done;
    expect(form.error()).toBe("The back-end refused it");
    expect(guard.hasDraft()).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();

    done = form.submit("text");
    expect(form.error(), "a new write clears the error").toBeNull();
    reject("not an Error");
    await done;
    expect(form.error()).toBe("Could not save");
  });

  it("a saved write ends the Draft until the form is clean, then runs onSaved (#187)", async () => {
    const { guard, form, resolve, onSaved, setDirty, setRerun } = renderDraftForm();
    const done = form.submit("text");
    resolve("saved");
    await done;
    expect(onSaved).toHaveBeenCalledExactlyOnceWith("saved");
    expect(guard.hasDraft()).toBe(false);
    setRerun(1);
    expect(guard.hasDraft(), "a re-run does not hold it again").toBe(false);

    setDirty(false);
    setDirty(true);
    expect(guard.hasDraft(), "a new change holds a Draft again").toBe(true);
  });

  it("a write that resolves to undefined is a saved write", async () => {
    const { guard, form, resolve, onSaved } = renderDraftForm();
    const done = form.submit("text");
    resolve(undefined);
    await done;
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(guard.hasDraft()).toBe(false);
    expect(form.error()).toBeNull();
  });
});

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
