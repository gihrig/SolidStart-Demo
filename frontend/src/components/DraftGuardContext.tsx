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
        message={guard.question()}
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
  /** The user drops the Draft (a Cancel, or a saved write that closes the
   *  form). The form's unmount then shows no notice. The Draft stays released
   *  until the form is clean: a report that re-runs before the saved text
   *  reloads does not hold it again (#187). */
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
  let cleared = false;
  createEffect(() => {
    const dirty = options.dirty();
    if (!dirty) cleared = false;
    guard.report(key, dirty && !cleared, options.scope);
  });
  // A Draft that an own delete released (`guard.release`) ends here too, with no
  // notice.
  onCleanup(() => {
    if (guard.holds(key)) guard.discard(key, options.notice?.() ?? DRAFT_DISCARDED_NOTICE);
    else guard.report(key, false);
  });
  return {
    clear: () => {
      cleared = true;
      guard.report(key, false);
    },
  };
}
