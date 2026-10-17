import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { createComponent, createRoot, createSignal, Suspense, type JSX } from "solid-js";
import { render, screen } from "@solidjs/testing-library";
import type { Like } from "~/types/jedi";
import { createLikeState, type LikeState } from "./createLikeState";

// The Like state of one Like target kind (#123): a Post or a Caption. This seam
// test drives the factory with a selected id, a live flag, and a stateful fake
// back-end; `createJediFeed.unit.test.ts` covers the Feed wiring around it.

const like = (id: number, likeCount: number, liked: boolean): Like => ({ id, likeCount, liked });

// A promise the test settles by hand, to hold a back-end call in flight.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

// A stateful fake back-end: target N has N * 10 Likes from other Users, plus 1
// while the viewer likes it. A toggle writes the wanted state, so a later read
// sees it (the factory rereads after a send).
const getLikeMock = vi.fn<(id: number) => Promise<Like>>();
const toggleLikeMock = vi.fn<(id: number, liked: boolean) => Promise<Like>>();
beforeEach(() => {
  const viewerLikes = new Set<number>();
  const likeOf = (id: number) =>
    like(id, id * 10 + (viewerLikes.has(id) ? 1 : 0), viewerLikes.has(id));
  getLikeMock.mockReset();
  getLikeMock.mockImplementation((id) => Promise.resolve(likeOf(id)));
  toggleLikeMock.mockReset();
  toggleLikeMock.mockImplementation((id, liked) => {
    if (liked) viewerLikes.add(id);
    else viewerLikes.delete(id);
    return Promise.resolve(likeOf(id));
  });
});

interface Harness {
  state: LikeState;
  select: (id: number | undefined) => void;
  setLive: (live: boolean) => void;
}

async function withLikeState(
  run: (h: Harness) => Promise<void>,
  { live = true }: { live?: boolean } = {},
) {
  await createRoot(async (dispose) => {
    const [selectedId, select] = createSignal<number | undefined>(1);
    const [isLive, setLive] = createSignal(live);
    const state = createLikeState({
      selectedId,
      live: isLive,
      getLike: getLikeMock,
      toggleLike: toggleLikeMock,
    });
    await tick();
    await tick();
    try {
      await run({ state, select, setLive });
    } finally {
      dispose();
    }
  });
}

describe("createLikeState — the server read", () => {
  it("has no like state and reads nothing while no live session is connected", () =>
    withLikeState(
      async ({ state }) => {
        expect(state.like()).toBeUndefined();
        expect(getLikeMock).not.toHaveBeenCalled();
      },
      { live: false },
    ));

  it("loads the selected target's like state, and re-keys with the selection", () =>
    withLikeState(async ({ state, select }) => {
      expect(state.like()).toEqual(like(1, 10, false));

      select(2);
      await tick();
      await tick();
      expect(state.like()).toEqual(like(2, 20, false));
    }));

  it("refetch rereads the selected target, so another User's Like shows", () =>
    withLikeState(async ({ state }) => {
      getLikeMock.mockResolvedValue(like(1, 11, false));
      state.refetch();
      await tick();
      await tick();
      expect(state.like()).toEqual(like(1, 11, false));
    }));

  it("has no like state when no target is selected", () =>
    withLikeState(async ({ state, select }) => {
      select(undefined);
      await tick();
      expect(state.like()).toBeUndefined();
    }));
});

describe("createLikeState — toggle", () => {
  it("sets the like to the opposite state, then back", () =>
    withLikeState(async ({ state }) => {
      await state.toggle();
      expect(toggleLikeMock).toHaveBeenLastCalledWith(1, true);
      expect(state.like()).toEqual(like(1, 11, true));

      await state.toggle();
      expect(toggleLikeMock).toHaveBeenLastCalledWith(1, false);
      expect(state.like()).toEqual(like(1, 10, false));
    }));

  it("does nothing without a like state", () =>
    withLikeState(
      async ({ state }) => {
        await state.toggle();
        expect(toggleLikeMock).not.toHaveBeenCalled();
      },
      { live: false },
    ));

  it("shows the Like at once, before the back-end answers", () =>
    withLikeState(async ({ state }) => {
      const answer = deferred<Like>();
      toggleLikeMock.mockReturnValueOnce(answer.promise);

      const done = state.toggle();
      expect(state.like()).toEqual(like(1, 11, true));

      answer.resolve(like(1, 11, true));
      await done;
    }));

  it("rolls the Like back and rejects when the back-end fails", () =>
    withLikeState(async ({ state }) => {
      toggleLikeMock.mockRejectedValueOnce(new Error("Network down"));

      await expect(state.toggle()).rejects.toThrow("Network down");
      await tick();
      expect(state.like()).toEqual(like(1, 10, false));
    }));

  it("ignores an older read that lands after the toggle (the race)", () =>
    withLikeState(async ({ state }) => {
      const olderRead = deferred<Like>();
      getLikeMock.mockReturnValueOnce(olderRead.promise);
      state.refetch();
      await tick();

      await state.toggle();
      olderRead.resolve(like(1, 10, false)); // read before our Like committed
      await tick();
      await tick();
      expect(state.like()).toEqual(like(1, 11, true));
    }));

  it("keeps fast clicks: the last wanted state wins, sent in order", () =>
    withLikeState(async ({ state }) => {
      const first = deferred<Like>();
      toggleLikeMock.mockReturnValueOnce(first.promise);

      const likeIt = state.toggle();
      const unlikeIt = state.toggle(); // while the like is in flight
      expect(state.like()).toEqual(like(1, 10, false));

      first.resolve(like(1, 11, true));
      await Promise.all([likeIt, unlikeIt]);
      await tick();
      expect(toggleLikeMock.mock.calls).toEqual([
        [1, true],
        [1, false],
      ]);
      expect(state.like()).toEqual(like(1, 10, false));
    }));

  it("keeps each target's last wanted state when the selection moves mid-toggle", () =>
    withLikeState(async ({ state, select }) => {
      const first = deferred<Like>();
      toggleLikeMock.mockReturnValueOnce(first.promise);

      const t1Like = state.toggle();
      const t1Unlike = state.toggle();
      select(2);
      await tick();
      await tick();
      const t2Like = state.toggle();
      expect(state.like()).toEqual(like(2, 21, true));

      first.resolve(like(1, 11, true));
      await Promise.all([t1Like, t1Unlike, t2Like]);
      expect(toggleLikeMock.mock.calls).toEqual([
        [1, true],
        [1, false],
        [2, true],
      ]);
    }));

  it("drops a queued Like when the live session ends, so it is never sent", () =>
    withLikeState(async ({ state, setLive }) => {
      const first = deferred<Like>();
      toggleLikeMock.mockReturnValueOnce(first.promise);

      const done = state.toggle(); // like, in flight
      void state.toggle(); // unlike, queued
      setLive(false);

      first.resolve(like(1, 11, true));
      await done;
      expect(toggleLikeMock.mock.calls).toEqual([[1, true]]);
      expect(state.like()).toBeUndefined();
    }));
});

describe("createLikeState — under the route's <Suspense>", () => {
  it("does not suspend while the first like state loads after login", async () => {
    // The Jedi route renders under the app's <Suspense>. A suspending read here
    // would swap the whole route for the fallback at login, like a page reload.
    const [live, setLive] = createSignal(false);
    const answer = deferred<Like>();
    getLikeMock.mockReturnValueOnce(answer.promise);
    render(() =>
      createComponent(Suspense, {
        fallback: "Loading",
        get children() {
          const state = createLikeState({
            selectedId: () => 1,
            live,
            getLike: getLikeMock,
            toggleLike: toggleLikeMock,
          });
          // A function child renders as reactive text.
          return (() => String(state.like()?.likeCount ?? "none")) as unknown as JSX.Element;
        },
      }),
    );
    expect(screen.getByText("none")).toBeInTheDocument();

    setLive(true);
    await tick();
    expect(screen.queryByText("Loading")).toBeNull();

    answer.resolve(like(1, 10, false));
    expect(await screen.findByText("10")).toBeInTheDocument();
  });
});
