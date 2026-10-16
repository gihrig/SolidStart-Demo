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
   *  reports through `useDraft`, which makes the key. A form in a `scope`
   *  reports it too. */
  report: (key: symbol, dirty: boolean, scope?: DraftScope) => void;
  /** Run a user-started move. With no Draft, it runs at once. With a Draft, it
   *  waits for the confirm dialog: `confirmMove` or `cancelMove`. A move names
   *  every scope that it unmounts, and it asks only about the Drafts in them. A
   *  move with no `scopes` asks about every Draft. */
  attempt: (move: () => void, scopes?: readonly DraftScope[]) => void;
  /** Whether a form in any of `scopes` holds a Draft; with no `scopes`, any
   *  form. */
  hasDraftIn: (scopes?: readonly DraftScope[]) => boolean;
  /** Whether a move waits for the confirm dialog. */
  pending: Accessor<boolean>;
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
  /** Close the notice ("OK"). */
  dismissNotice: () => void;
}

/** The notice of a forced discard whose cause the form cannot name. */
export const DRAFT_DISCARDED_NOTICE = "Your unsaved changes were discarded.";

/** A guard that holds nothing: each move runs at once. The default where no
 *  app guard is given (a component or view-model test). */
export const passThroughGuard: DraftGuard = {
  hasDraft: () => false,
  holds: () => false,
  report: () => {},
  attempt: (move) => move(),
  hasDraftIn: () => false,
  pending: () => false,
  confirmMove: () => {},
  cancelMove: () => {},
  notice: () => undefined,
  discard: () => {},
  dismissNotice: () => {},
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
  const [hasDraft, setHasDraft] = createSignal(false);
  // The move sits in an object: a bare function given to a setter runs as an
  // updater.
  const [pendingMove, setPendingMove] = createSignal<{
    run: () => void;
    scopes?: readonly DraftScope[];
  }>();
  const [notice, setNotice] = createSignal<string>();

  let listening = false;
  const sync = () => {
    const dirty = drafts.size > 0;
    setHasDraft(dirty);
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
    if (dirty) drafts.set(key, scope);
    else drafts.delete(key);
    sync();
  };

  // The keys of the Drafts in `scopes`; with no `scopes`, every Draft's key.
  const draftsIn = (scopes: readonly DraftScope[] | undefined): symbol[] =>
    [...drafts]
      .filter(([, s]) => scopes === undefined || (s !== undefined && scopes.includes(s)))
      .map(([key]) => key);

  const attempt = (move: () => void, scopes?: readonly DraftScope[]): void => {
    if (draftsIn(scopes).length === 0) move();
    else setPendingMove({ run: move, scopes });
  };

  // One batch: the view never sees the state between the drop and the move,
  // such as the selected Post that a Draft no longer holds.
  const confirmMove = (): void => {
    const move = pendingMove();
    if (!move) return;
    batch(() => {
      setPendingMove(undefined);
      for (const key of draftsIn(move.scopes)) drafts.delete(key);
      sync();
      move.run();
    });
  };

  const discard = (key: symbol, message: string): void => {
    report(key, false);
    setPendingMove(undefined);
    setNotice(message);
  };

  return {
    hasDraft,
    holds: (key) => drafts.has(key),
    report,
    attempt,
    hasDraftIn: (scopes) => draftsIn(scopes).length > 0,
    pending: () => pendingMove() !== undefined,
    confirmMove,
    cancelMove: () => setPendingMove(undefined),
    notice,
    discard,
    dismissNotice: () => setNotice(undefined),
  };
}
