import {
  createContext,
  createEffect,
  onCleanup,
  useContext,
  type Accessor,
  type ParentComponent,
} from "solid-js";
import { useBeforeLeave } from "@solidjs/router";
import {
  createDraftGuard,
  DRAFT_DISCARDED_NOTICE,
  passThroughGuard,
  type DraftGuard,
  type DraftScope,
} from "~/lib/createDraftGuard";
import ConfirmDialog from "~/components/ConfirmDialog";

/** The app's one Draft guard. Without a provider, the pass-through guard: a
 *  component test without the app shell behaves as before the guard. A test
 *  provides its own with `<DraftGuardContext.Provider value={guard}>`. */
export const DraftGuardContext = createContext<DraftGuard>(passThroughGuard);

/**
 * The app's Draft guard (ADR-0030), in `app.tsx` inside the Router. It shares
 * one guard, routes every in-app route move through it (`useBeforeLeave`), and
 * shows the confirm dialog and the forced-discard notice.
 */
export const DraftGuardProvider: ParentComponent = (props) => {
  const guard = createDraftGuard();
  // A route move with a Draft waits for the dialog; "Discard" retries it past
  // this check.
  useBeforeLeave((e) => {
    if (e.defaultPrevented || !guard.hasDraft()) return;
    e.preventDefault();
    guard.attempt(() => e.retry(true));
  });

  return (
    <DraftGuardContext.Provider value={guard}>
      {props.children}
      <ConfirmDialog
        open={guard.pending()}
        message="You have unsaved changes. Discard them?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={guard.confirmMove}
        onCancel={guard.cancelMove}
      />
      <ConfirmDialog
        open={guard.notice() !== undefined}
        message={guard.notice() ?? ""}
        confirmLabel="OK"
        onConfirm={guard.dismissNotice}
      />
    </DraftGuardContext.Provider>
  );
};

export function useDraftGuard(): DraftGuard {
  return useContext(DraftGuardContext);
}

export interface DraftOptions {
  /** Whether the form holds a Draft now. An effect reads it, so each change
   *  of a signal it reads reports again: an input, and a change of the saved
   *  text. */
  dirty: Accessor<boolean>;
  /** The form's scope, when a move can unmount its group of forms alone. */
  scope?: DraftScope;
  /** The notice of a forced discard, read when the form unmounts. Defaults to
   *  `DRAFT_DISCARDED_NOTICE`. */
  notice?: () => string;
}

export interface Draft {
  /** The user drops the Draft (a Cancel). The form's unmount then shows no
   *  notice. */
  clear: () => void;
}

/**
 * One form's Draft in the app's guard (ADR-0030). It owns the form's key, so
 * two forms never share one. It reports `dirty()` as it changes. An unmount
 * with a Draft that the user did not discard is a forced discard: the guard
 * shows the notice.
 */
export function useDraft(options: DraftOptions): Draft {
  const guard = useDraftGuard();
  const key = Symbol("draft");
  createEffect(() => guard.report(key, options.dirty(), options.scope));
  onCleanup(() => {
    if (guard.holds(key)) guard.discard(key, options.notice?.() ?? DRAFT_DISCARDED_NOTICE);
  });
  return { clear: () => guard.report(key, false) };
}
