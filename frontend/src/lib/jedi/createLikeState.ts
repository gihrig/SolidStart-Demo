import { createComputed, createResource, createSignal, on, type Accessor } from "solid-js";
import type { Like } from "~/types/jedi";

/** The inputs of one Like state: the target shown, and its two back-end calls. */
export interface LikeStateDeps {
  /** The id of the Like target shown (a Post or a Caption); undefined for none. */
  selectedId: Accessor<number | undefined>;
  /** True while a live session is connected. The read needs a login, so the
   *  state loads only while live. When it turns false (logout), the wanted
   *  states drop, so a queued send never goes out with the next User's cookie. */
  live: Accessor<boolean>;
  getLike: (id: number) => Promise<Like>;
  toggleLike: (id: number, liked: boolean) => Promise<Like>;
}

/** The viewer's Like state of the selected target, and its two actions. */
export interface LikeState {
  /** The live count and whether the viewer likes the selected target.
   *  Undefined while it loads, and while no live session is connected. */
  like: Accessor<Like | undefined>;
  /** Like or unlike the selected target: the opposite of the state shown. The
   *  change shows at once, then the back-end's answer replaces it; a click while
   *  a toggle runs counts too. A no-op without a like state. Rejects, and rolls
   *  the Like back, when the back-end fails. */
  toggle: () => Promise<void>;
  /** Reread the selected target's like state (a poke, or a socket reconnect). */
  refetch: () => void;
}

/**
 * The Like state of one Like target kind (#122, #123): the server read, the
 * wanted-state overlay, the send loop, and the race fix. `createJediFeed` makes
 * one for the Post and one for the Caption, and keeps the Feed wiring.
 */
export function createLikeState(deps: LikeStateDeps): LikeState {
  const { selectedId, live, getLike, toggleLike } = deps;

  // The server read re-keys with the selected target, and only while live.
  const [serverRead, { refetch, mutate: setServerRead }] = createResource(
    () => (live() ? selectedId() : undefined),
    (id) => getLike(id),
  );
  // `.latest` does not suspend once a load has finished, so match on the result's
  // id, and never show a previous target's like state. Before the first load
  // finishes ("pending"), `.latest` reads the resource itself and suspends: under
  // the route's <Suspense> that swaps the page for the fallback at login (#123).
  const serverLike = (): Like | undefined => {
    const result = serverRead.state === "pending" ? undefined : serverRead.latest;
    return live() && result?.id === selectedId() ? result : undefined;
  };

  // The viewer's latest wanted like state of each target that the back-end has
  // not confirmed yet (id -> liked). A click sets it, so the Like shows at once.
  // One entry per target, so moving to another target mid-toggle loses no click.
  const [pendingLikes, setPendingLikes] = createSignal<ReadonlyMap<number, boolean>>(new Map());
  createComputed(
    on(
      live,
      (isLive) => {
        if (!isLive) setPendingLikes(new Map());
      },
      { defer: true },
    ),
  );

  // What the viewer sees: the server state with the wanted state laid over it.
  // The count moves by one from the server count. A read that lands while a
  // toggle runs updates only the server layer, so it cannot undo the click.
  const like = (): Like | undefined => {
    const server = serverLike();
    const liked = server && pendingLikes().get(server.id);
    if (!server || liked === undefined || liked === server.liked) return server;
    return {
      id: server.id,
      likeCount: server.likeCount + (liked ? 1 : -1),
      liked,
    };
  };

  // One send runs at a time. It sends each target's wanted state until the
  // back-end's answer matches the newest one, so fast clicks end in the last
  // wanted state, sent in order. The toggle sends the wanted state, not a flip,
  // so a repeat is a no-op on the back-end.
  let sending: Promise<void> | undefined;
  const sendPendingLikes = async (): Promise<void> => {
    const confirmed = new Map<number, Like>();
    const unconfirmed = () =>
      [...pendingLikes()].find(([id, liked]) => confirmed.get(id)?.liked !== liked);
    try {
      for (let next = unconfirmed(); next; next = unconfirmed()) {
        const [id, liked] = next;
        confirmed.set(id, await toggleLike(id, liked));
      }
      // Show the selected target's answer; another target's answer must not
      // replace the selected target's like state.
      const result = confirmed.get(selectedId() ?? Number.NaN);
      if (result) setServerRead(result);
    } finally {
      // Confirmed or failed, drop the wanted states: a failure rolls back to the
      // server state. Then reread. The reread is the latest fetch, so Solid
      // ignores an older read still in flight, which would otherwise land last
      // and show the state from before the click (#122 review).
      setPendingLikes(new Map());
      sending = undefined;
      void refetch();
    }
  };
  // Every caller awaits the running send, so each one sees its failure.
  const toggle = (): Promise<void> => {
    const current = like();
    if (!current) return Promise.resolve();
    setPendingLikes((wanted) => new Map(wanted).set(current.id, !current.liked));
    sending ??= sendPendingLikes();
    return sending;
  };

  return { like, toggle, refetch: () => void refetch() };
}
