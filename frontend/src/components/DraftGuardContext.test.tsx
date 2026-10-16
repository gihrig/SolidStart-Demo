import { describe, it, expect } from "vite-plus/test";
import { render } from "@solidjs/testing-library";
import { createSignal, Show } from "solid-js";
import { createDraftGuard } from "~/lib/createDraftGuard";
import { DraftGuardContext, useDraft, type Draft } from "./DraftGuardContext";

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
