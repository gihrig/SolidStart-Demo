import { batch, createSignal, getOwner, onCleanup, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";

/** A group of forms that one move closes, such as the forms in one panel. A
 *  scope can sit under a parent scope: a guard call that names a scope also
 *  matches the Drafts in each scope under it. */
export interface DraftScope {
  readonly name: string;
  readonly parent?: DraftScope;
}

/** A new scope, under `parent` when it is given. Each call makes a new scope. */
export function createDraftScope(name: string, parent?: DraftScope): DraftScope {
  return parent === undefined ? { name } : { name, parent };
}

/** Whether `scope` is `outer` or sits under it (#271). */
const within = (scope: DraftScope | undefined, outer: DraftScope): boolean => {
  for (let s = scope; s !== undefined; s = s.parent) if (s === outer) return true;
  return false;
};

/** The app-level guard for unsaved form text (ADR-0030). */
export interface DraftGuard {
  /** Whether any form holds a Draft. */
  hasDraft: Accessor<boolean>;
  /** Whether the form under `key` holds a Draft. A form reads it when it
   *  unmounts: a Draft still held then was not discarded by the user. */
  holds: (key: symbol) => boolean;
  /** A form reports whether it holds a Draft, under its own key. It reports
   *  `false` when it saves, when it cancels, and when it unmounts. A form
   *  reports through `useDraftForm`, which makes the key. A form in a `scope`
   *  reports it too. */
  report: (key: symbol, dirty: boolean, scope?: DraftScope) => void;
  /** Run a user-started move. With no Draft, it runs at once. With a Draft, it
   *  waits for the confirm dialog: `confirmMove` or `cancelMove`. A move names
   *  the scope that it closes, and it asks only about the Drafts in that scope
   *  and in each scope under it (#271). A move with no `scope` asks about every
   *  Draft. While a form in its scope writes, it does nothing and asks nothing
   *  (#214); with no `scope`, every form counts. */
  attempt: (move: () => void, scope?: DraftScope) => void;
  /** A form's Cancel (#214): `close` closes the form under `key`. Without a
   *  Draft in that form, it runs at once. With one, it waits for the confirm
   *  dialog, which asks about that form only: "Discard" drops its Draft, then
   *  runs `close`. */
  cancel: (key: symbol, close: () => void) => void;
  /** A form reports whether its write is in flight, under its own key (#214).
   *  A form reports through `useDraftForm`, with its scope. */
  reportBusy: (key: symbol, busy: boolean, scope?: DraftScope) => void;
  /** Whether a form in `scope`, or in a scope under it, writes; with no
   *  `scope`, any form. */
  busyIn: (scope?: DraftScope) => boolean;
  /** Whether a form in `scope`, or in a scope under it, holds a Draft; with no
   *  `scope`, any form. It is reactive. */
  hasDraftIn: (scope?: DraftScope) => boolean;
  /** Whether a move waits for the confirm dialog. */
  pending: Accessor<boolean>;
  /** The confirm dialog's question: the waiting `ask`'s message, else the
   *  question of a move. */
  question: Accessor<string>;
  /** Ask whether to keep the Drafts in `scope`, or every Draft with no
   *  `scope`, after an Event made them doubtful (#187), such as a Post that
   *  left the selected Category. It waits as a move does: "Keep editing" keeps
   *  them, and "Discard" drops them, then runs `onDiscard`, such as a close of
   *  the forms. It replaces a waiting move. With no Draft, it does not ask. */
  ask: (message: string, scope?: DraftScope, onDiscard?: () => void) => void;
  /** "Discard": drop the Drafts the waiting move closes (every Draft, or the
   *  Drafts in its scope), then run it. */
  confirmMove: () => void;
  /** "Keep editing": drop the waiting move. The Drafts stay. */
  cancelMove: () => void;
  /** The forced-discard notice, else undefined. */
  notice: Accessor<string | undefined>;
  /** A forced discard: an Event removed the subject of the Draft under `key`.
   *  It drops that Draft, cancels a waiting move, and shows `message`. */
  discard: (key: symbol, message: string) => void;
  /** A forced discard of every Draft in `scope`, or of every Draft with no
   *  `scope` (#187): an Event removed their subject, such as a deleted Post.
   *  With a Draft, it drops them, cancels a waiting move and shows `message`.
   *  Returns whether it dropped a Draft. */
  discardIn: (scope: DraftScope | undefined, message: string) => boolean;
  /** Close the notice ("OK"). */
  dismissNotice: () => void;
  /** The Owner's own delete (#187): release the Drafts in `scope`, or every
   *  Draft with no `scope`, with no notice. A released form's unmount shows
   *  none. Returns `restore`, which holds them again after a failed delete; a
   *  form that ended its Draft or unmounted meanwhile is not held again. */
  release: (scope?: DraftScope) => () => void;
}

/** The notice of a forced discard whose cause the form cannot name. */
export const DRAFT_DISCARDED_NOTICE = "Your unsaved changes were discarded.";

/** The question of a user-started move with a Draft. */
const MOVE_QUESTION = "You have unsaved changes. Discard them?";

/** A guard that holds nothing: each move runs at once. The default where no
 *  app guard is given (a component or view-model test). */
export const passThroughGuard: DraftGuard = {
  hasDraft: () => false,
  holds: () => false,
  report: () => {},
  attempt: (move) => move(),
  cancel: (_key, close) => close(),
  reportBusy: () => {},
  busyIn: () => false,
  hasDraftIn: () => false,
  pending: () => false,
  question: () => MOVE_QUESTION,
  ask: () => {},
  confirmMove: () => {},
  cancelMove: () => {},
  notice: () => undefined,
  discard: () => {},
  discardIn: () => false,
  dismissNotice: () => {},
  release: () => () => {},
};

const blockUnload = (e: BeforeUnloadEvent) => e.preventDefault();

/**
 * One guard per app (ADR-0030): `DraftGuardProvider` builds it and shares it.
 * Forms report yes or no; the text stays in the form. A reload, a tab close or
 * an external link fires `beforeunload`: the guard listens to it only while a
 * Draft exists, and the browser then shows its own text.
 */
export function createDraftGuard(): DraftGuard {
  // Each form's key with a Draft, and the form's scope.
  const drafts = new Map<symbol, DraftScope | undefined>();
  // The Drafts that an own delete released (`release`), until it fails or the
  // form ends its Draft.
  const released = new Map<symbol, DraftScope | undefined>();
  const [hasDraft, setHasDraft] = createSignal(false);
  // Each change of `drafts`, so a read of the Drafts in a scope is reactive
  // (#214).
  const [draftsChanged, setDraftsChanged] = createSignal(undefined, { equals: false });
  // Each writing form's key, and the form's scope (#214).
  const busy = new Map<symbol, DraftScope | undefined>();
  // The move sits in an object: a bare function given to a setter runs as an
  // updater. A move names its scope, or one form's `key` (a Cancel).
  const [pendingMove, setPendingMove] = createSignal<{
    run: () => void;
    scope?: DraftScope;
    key?: symbol;
    message?: string;
  }>();
  const [notice, setNotice] = createSignal<string>();

  let listening = false;
  const sync = () => {
    const dirty = drafts.size > 0;
    setHasDraft(dirty);
    setDraftsChanged();
    if (isServer || dirty === listening) return;
    listening = dirty;
    if (dirty) window.addEventListener("beforeunload", blockUnload);
    else window.removeEventListener("beforeunload", blockUnload);
  };
  if (getOwner()) {
    onCleanup(() => {
      drafts.clear();
      sync();
    });
  }

  const report = (key: symbol, dirty: boolean, scope?: DraftScope): void => {
    if (released.has(key)) {
      if (dirty) released.set(key, scope);
      else released.delete(key);
      return;
    }
    if (dirty) drafts.set(key, scope);
    else drafts.delete(key);
    sync();
  };

  // The keys in `forms` in `scope` or in a scope under it; with no `scope`,
  // every key.
  const keysIn = (
    forms: Map<symbol, DraftScope | undefined>,
    scope: DraftScope | undefined,
  ): symbol[] =>
    [...forms].filter(([, s]) => scope === undefined || within(s, scope)).map(([key]) => key);
  const draftsIn = (scope: DraftScope | undefined) => keysIn(drafts, scope);
  const busyIn = (scope?: DraftScope) => keysIn(busy, scope).length > 0;

  const attempt = (move: () => void, scope?: DraftScope): void => {
    if (busyIn(scope)) return;
    if (draftsIn(scope).length === 0) move();
    else setPendingMove({ run: move, scope });
  };

  const cancel = (key: symbol, close: () => void): void => {
    if (drafts.has(key)) setPendingMove({ run: close, key });
    else close();
  };

  // One batch: the view never sees the state between the drop and the move,
  // such as the selected Post that a Draft no longer holds. A Cancel's close
  // runs after the batch: it moves focus, which needs the closed form gone and
  // the confirm dialog closed.
  const confirmMove = (): void => {
    const move = pendingMove();
    if (!move) return;
    batch(() => {
      setPendingMove(undefined);
      for (const key of move.key ? [move.key] : draftsIn(move.scope)) drafts.delete(key);
      sync();
      if (!move.key) move.run();
    });
    if (move.key) move.run();
  };

  const discard = (key: symbol, message: string): void => {
    report(key, false);
    setPendingMove(undefined);
    setNotice(message);
  };

  const discardIn = (scope: DraftScope | undefined, message: string): boolean => {
    const keys = draftsIn(scope);
    if (keys.length === 0) return false;
    batch(() => {
      for (const key of keys) drafts.delete(key);
      sync();
      setPendingMove(undefined);
      setNotice(message);
    });
    return true;
  };

  const release = (scope?: DraftScope): (() => void) => {
    const keys = draftsIn(scope);
    for (const key of keys) {
      released.set(key, drafts.get(key));
      drafts.delete(key);
    }
    sync();
    return () => {
      for (const key of keys) {
        if (!released.has(key)) continue;
        drafts.set(key, released.get(key));
        released.delete(key);
      }
      sync();
    };
  };

  return {
    hasDraft,
    holds: (key) => drafts.has(key),
    report,
    attempt,
    cancel,
    reportBusy: (key, isBusy, scope) => {
      if (isBusy) busy.set(key, scope);
      else busy.delete(key);
    },
    busyIn,
    hasDraftIn: (scope) => {
      draftsChanged();
      return draftsIn(scope).length > 0;
    },
    pending: () => pendingMove() !== undefined,
    question: () => pendingMove()?.message ?? MOVE_QUESTION,
    ask: (message, scope, onDiscard) => {
      if (draftsIn(scope).length > 0) {
        setPendingMove({ run: onDiscard ?? (() => {}), scope, message });
      }
    },
    confirmMove,
    cancelMove: () => setPendingMove(undefined),
    notice,
    discard,
    discardIn,
    dismissNotice: () => setNotice(undefined),
    release,
  };
}
