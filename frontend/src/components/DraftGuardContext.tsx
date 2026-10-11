import { createContext, useContext, type ParentComponent } from "solid-js";
import { useBeforeLeave } from "@solidjs/router";
import { createDraftGuard, passThroughGuard, type DraftGuard } from "~/lib/createDraftGuard";
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
