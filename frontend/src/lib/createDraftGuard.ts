import { createSignal, getOwner, onCleanup, type Accessor } from "solid-js";
import { isServer } from "solid-js/web";

/** The app-level guard for unsaved form text (ADR-0030). */
export interface DraftGuard {
  /** Whether any form holds a Draft. */
  hasDraft: Accessor<boolean>;
  /** Whether the form under `key` holds a Draft. A form reads it when it
   *  unmounts: a Draft still held then was not discarded by the user. */
  holds: (key: string) => boolean;
  /** A form reports whether it holds a Draft, under its own key. It reports
   *  `false` when it saves, when it cancels, and when it unmounts. */
  report: (key: string, dirty: boolean) => void;
  /** Run a user-started move. With no Draft, it runs at once. With a Draft, it
   *  waits for the confirm dialog: `confirmMove` or `cancelMove`. */
  attempt: (move: () => void) => void;
  /** Whether a move waits for the confirm dialog. */
  pending: Accessor<boolean>;
  /** "Discard": drop every Draft, then run the waiting move. */
  confirmMove: () => void;
  /** "Keep editing": drop the waiting move. The Drafts stay. */
  cancelMove: () => void;
  /** The forced-discard notice, else undefined. */
  notice: Accessor<string | undefined>;
  /** A forced discard: an Event removed the subject of the Draft under `key`.
   *  It drops that Draft, cancels a waiting move, and shows `message`. */
  discard: (key: string, message: string) => void;
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
  const drafts = new Set<string>();
  const [hasDraft, setHasDraft] = createSignal(false);
  // The move sits in an object: a bare function given to a setter runs as an
  // updater.
  const [pendingMove, setPendingMove] = createSignal<{ run: () => void }>();
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

  const report = (key: string, dirty: boolean): void => {
    if (dirty) drafts.add(key);
    else drafts.delete(key);
    sync();
  };

  const attempt = (move: () => void): void => {
    if (drafts.size === 0) move();
    else setPendingMove({ run: move });
  };

  const confirmMove = (): void => {
    const move = pendingMove();
    if (!move) return;
    setPendingMove(undefined);
    drafts.clear();
    sync();
    move.run();
  };

  const discard = (key: string, message: string): void => {
    report(key, false);
    setPendingMove(undefined);
    setNotice(message);
  };

  return {
    hasDraft,
    holds: (key) => drafts.has(key),
    report,
    attempt,
    pending: () => pendingMove() !== undefined,
    confirmMove,
    cancelMove: () => setPendingMove(undefined),
    notice,
    discard,
    dismissNotice: () => setNotice(undefined),
  };
}
