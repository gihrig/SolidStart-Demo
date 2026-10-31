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
import { createRpcAction } from "~/lib/createRpcAction";
import { isImeKey } from "~/lib/isImeKey";
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
  // this check. While any form writes, `attempt` refuses it with no question
  // (#214).
  useBeforeLeave((e) => {
    if (e.defaultPrevented || !(guard.hasDraft() || guard.busyIn())) return;
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

interface DraftOptions {
  /** Whether the form holds a Draft now. An effect reads it, so each change
   *  of a signal it reads reports again: an input, and a change of the saved
   *  text. */
  dirty: Accessor<boolean>;
  /** The form's scope, when a move can unmount its group of forms alone. */
  scope?: DraftScope;
  /** Whether the form's write is in flight (#214). While it is, no move that
   *  would unmount the form runs. */
  busy?: Accessor<boolean>;
  /** The notice of a forced discard, read when the form unmounts. Defaults to
   *  `DRAFT_DISCARDED_NOTICE`. */
  notice?: () => string;
}

interface Draft {
  /** The user drops the Draft (a Cancel, or a saved write that closes the
   *  form). The form's unmount then shows no notice. The Draft stays released
   *  until the form is clean: a report that re-runs before the saved text
   *  reloads does not hold it again (#187). */
  clear: () => void;
  /** The form's Cancel (#214). Without a Draft, it runs `close` at once. With
   *  one, the guard asks about this form only: "Discard" drops the Draft, then
   *  runs `close`; "Keep editing" keeps both. */
  cancel: (close: () => void) => void;
}

/**
 * One form's Draft in the app's guard (ADR-0030), inside `useDraftForm`. It
 * owns the form's key, so two forms never share one. It reports `dirty()` as
 * it changes. An unmount with a Draft that the user did not discard is a
 * forced discard: the guard shows the notice.
 */
function useDraft(options: DraftOptions): Draft {
  const guard = useDraftGuard();
  const key = Symbol("draft");
  let cleared = false;
  createEffect(() => {
    const dirty = options.dirty();
    if (!dirty) cleared = false;
    guard.report(key, dirty && !cleared, options.scope);
  });
  createEffect(() => guard.reportBusy(key, options.busy?.() ?? false, options.scope));
  // A Draft that an own delete released (`guard.release`) ends here too, with no
  // notice.
  onCleanup(() => {
    guard.reportBusy(key, false);
    if (guard.holds(key)) guard.discard(key, options.notice?.() ?? DRAFT_DISCARDED_NOTICE);
    else guard.report(key, false);
  });
  const clear = () => {
    cleared = true;
    guard.report(key, false);
  };
  return {
    clear,
    cancel: (close) =>
      guard.cancel(key, () => {
        clear();
        close();
      }),
  };
}

export interface DraftFormOptions<TArgs, TResult> {
  /** Whether the form holds a Draft now: the form's own Draft test. */
  dirty: Accessor<boolean>;
  /** The form's scope, when a move can unmount its group of forms alone. */
  scope?: DraftScope;
  /** The notice of a forced discard. Defaults to `DRAFT_DISCARDED_NOTICE`. */
  notice?: () => string;
  /** The Cancel's step, read at each Cancel and Escape. None: the form has no
   *  Cancel, and Escape does nothing. */
  close?: Accessor<(() => void) | undefined>;
  /** What Escape runs when that is not the Cancel (#210). It gets the Cancel and
   *  returns an action, or none. Default: the Cancel, when the form has one. */
  escape?: (cancel: () => void) => (() => void) | undefined;
  /** The form's write. It rejects on failure. */
  write: (args: TArgs) => Promise<TResult>;
  /** The error text of a failure that is not an `Error`. */
  fallbackError: string;
  /** Runs after a saved write, only while the form is mounted. The Draft has
   *  ended. */
  onSaved?: (result: TResult) => void;
}

export interface DraftForm<TArgs> {
  /** Runs the write. A late result, after the form unmounts, changes nothing. */
  submit: (args: TArgs) => Promise<void>;
  /** Whether the write is in flight. */
  pending: Accessor<boolean>;
  /** The last write's error, or null. */
  error: Accessor<string | null>;
  /** The form's Cancel: with a Draft, it asks first. */
  cancel: () => void;
  /** The form's key handler: Escape is the Cancel, or the `escape` action. */
  keydown: (e: KeyboardEvent) => void;
}

/**
 * One form's Draft and write (ADR-0030, #270). It reports the form's Draft and
 * its write in flight to the app's guard (#214). A Cancel with a Draft asks
 * first. A saved write ends the Draft, then runs `onSaved`. A write that ends
 * after the form unmounts changes nothing in the form. The form keeps its
 * fields, its Draft test, its write and its remote-edit merge.
 */
export function useDraftForm<TArgs, TResult>(
  options: DraftFormOptions<TArgs, TResult>,
): DraftForm<TArgs> {
  // The wrap keeps a result of `undefined` apart from the failure value of
  // `createRpcAction`, so no write returns `true` only to show it saved.
  const action = createRpcAction(async (args: TArgs) => ({ result: await options.write(args) }), {
    fallbackError: options.fallbackError,
  });
  const draft = useDraft({
    dirty: options.dirty,
    scope: options.scope,
    busy: action.pending,
    notice: options.notice,
  });
  // A write can outlive its form: its owner can unmount it (a browser close, a
  // new Post). A stale result must not close or clear the next form (#185 and
  // PR #216 reviews). The write itself still lands.
  let unmounted = false;
  onCleanup(() => (unmounted = true));

  const submit = async (args: TArgs) => {
    const saved = await action.run(args);
    if (!saved || unmounted) return;
    draft.clear();
    options.onSaved?.(saved.result);
  };
  const cancel = () => {
    const close = options.close?.();
    if (close) draft.cancel(close);
  };
  // The form stops Escape, so a document listener (`useDismiss`) does not close
  // a menu or the sidebar. An Escape that acts also cancels the browser's own
  // Escape action, which would close the question that the action opens
  // (#210). An IME's Escape ends its composition (#251), and while the form
  // writes, Escape does nothing.
  const keydown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (isImeKey(e) || action.pending()) return;
    const act = options.escape ? options.escape(cancel) : options.close?.() && cancel;
    if (!act) return;
    e.preventDefault();
    act();
  };

  return { submit, pending: action.pending, error: action.error, cancel, keydown };
}
