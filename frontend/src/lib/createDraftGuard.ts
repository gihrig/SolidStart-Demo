import { batch, createSignal, getOwner, onCleanup, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";

/** A group of forms that one move unmounts, such as the forms in one panel.
 *  A move that names scopes asks only about the Drafts in them. */
export type DraftScope = symbol;

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
   *  every scope that it unmounts, and it asks only about the Drafts in them. A
   *  move with no `scopes` asks about every Draft. While a form in its scopes
   *  writes, it does nothing and asks nothing (#214); with no `scopes`, every
   *  form counts. */
  attempt: (move: () => void, scopes?: readonly DraftScope[]) => void;
  /** A form's Cancel (#214): `close` closes the form under `key`. Without a
   *  Draft in that form, it runs at once. With one, it waits for the confirm
   *  dialog, which asks about that form only: "Discard" drops its Draft, then
   *  runs `close`. */
  cancel: (key: symbol, close: () => void) => void;
  /** A form reports whether its write is in flight, under its own key (#214).
   *  A form reports through `useDraftForm`, with its scope. */
  reportBusy: (key: symbol, busy: boolean, scope?: DraftScope) => void;
  /** Whether a form in any of `scopes` writes; with no `scopes`, any form. */
  busyIn: (scopes?: readonly DraftScope[]) => boolean;
  /** Whether a form in any of `scopes` holds a Draft; with no `scopes`, any
   *  form. It is reactive. */
  hasDraftIn: (scopes?: readonly DraftScope[]) => boolean;
  /** Whether a move waits for the confirm dialog. */
  pending: Accessor<boolean>;
  /** The confirm dialog's question: the waiting `ask`'s message, else the
   *  question of a move. */
  question: Accessor<string>;
  /** Ask whether to keep the Drafts in `scopes`, or every Draft with no
   *  `scopes`, after an Event made them doubtful (#187), such as a Post that
   *  left the selected Category. It waits as a move does: "Keep editing" keeps
   *  them, and "Discard" drops them, then runs `onDiscard`, such as a close of
   *  the forms. It replaces a waiting move. With no Draft, it does not ask. */
  ask: (message: string, scopes?: readonly DraftScope[], onDiscard?: () => void) => void;
  /** "Discard": drop the Drafts the waiting move unmounts (every Draft, or
   *  its scopes'), then run it. */
  confirmMove: () => void;
  /** "Keep editing": drop the waiting move. The Drafts stay. */
  cancelMove: () => void;
  /** The forced-discard notice, else undefined. */
  notice: Accessor<string | undefined>;
  /** A forced discard: an Event removed the subject of the Draft under `key`.
   *  It drops that Draft, cancels a waiting move, and shows `message`. */
  discard: (key: symbol, message: string) => void;
  /** A forced discard of every Draft in `scopes`, or of every Draft with no
   *  `scopes` (#187): an Event removed their subject, such as a deleted Post.
   *  With a Draft, it drops them, cancels a waiting move and shows `message`.
   *  Returns whether it dropped a Draft. */
  discardIn: (scopes: readonly DraftScope[] | undefined, message: string) => boolean;
  /** Close the notice ("OK"). */
  dismissNotice: () => void;
  /** The Owner's own delete (#187): release the Drafts in `scopes`, or every
   *  Draft with no `scopes`, with no notice. A released form's unmount shows
   *  none. Returns `restore`, which holds them again after a failed delete; a
   *  form that ended its Draft or unmounted meanwhile is not held again. */
  release: (scopes?: readonly DraftScope[]) => () => void;
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
  // Each change of `drafts`, so a read of the Drafts in some scopes is
  // reactive (#214).
  const [draftsChanged, setDraftsChanged] = createSignal(undefined, { equals: false });
  // Each writing form's key, and the form's scope (#214).
  const busy = new Map<symbol, DraftScope | undefined>();
  // The move sits in an object: a bare function given to a setter runs as an
  // updater. A move names its scopes, or one form's `key` (a Cancel).
  const [pendingMove, setPendingMove] = createSignal<{
    run: () => void;
    scopes?: readonly DraftScope[];
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

  // The keys in `forms` in `scopes`; with no `scopes`, every key.
  const keysIn = (
    forms: Map<symbol, DraftScope | undefined>,
    scopes: readonly DraftScope[] | undefined,
  ): symbol[] =>
    [...forms]
      .filter(([, s]) => scopes === undefined || (s !== undefined && scopes.includes(s)))
      .map(([key]) => key);
  const draftsIn = (scopes: readonly DraftScope[] | undefined) => keysIn(drafts, scopes);
  const busyIn = (scopes?: readonly DraftScope[]) => keysIn(busy, scopes).length > 0;

  const attempt = (move: () => void, scopes?: readonly DraftScope[]): void => {
    if (busyIn(scopes)) return;
    if (draftsIn(scopes).length === 0) move();
    else setPendingMove({ run: move, scopes });
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
      for (const key of move.key ? [move.key] : draftsIn(move.scopes)) drafts.delete(key);
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

  const discardIn = (scopes: readonly DraftScope[] | undefined, message: string): boolean => {
    const keys = draftsIn(scopes);
    if (keys.length === 0) return false;
    batch(() => {
      for (const key of keys) drafts.delete(key);
      sync();
      setPendingMove(undefined);
      setNotice(message);
    });
    return true;
  };

  const release = (scopes?: readonly DraftScope[]): (() => void) => {
    const keys = draftsIn(scopes);
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
    hasDraftIn: (scopes) => {
      draftsChanged();
      return draftsIn(scopes).length > 0;
    },
    pending: () => pendingMove() !== undefined,
    question: () => pendingMove()?.message ?? MOVE_QUESTION,
    ask: (message, scopes, onDiscard) => {
      if (draftsIn(scopes).length > 0) {
        setPendingMove({ run: onDiscard ?? (() => {}), scopes, message });
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
