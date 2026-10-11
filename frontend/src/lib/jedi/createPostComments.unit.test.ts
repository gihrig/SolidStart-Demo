import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { createRoot, createSignal } from "solid-js";
import type { FeedHandler } from "~/lib/feed";
import type { JediApi } from "~/lib/jedi/jedi-api";
import type { PostComment as PostCommentWire } from "~/types/backend";
import type { PostComment } from "~/types/jedi";
import { createPostComments, type PostComments } from "./createPostComments";

// The Comment thread of the selected Post (#124). This seam test drives the
// factory with a selected Post id and a stateful fake back-end, and hands it
// Feed Events through `onEvent`; `createJediFeed.unit.test.ts` covers the Feed
// wiring around it.

const comment = (id: number, postId: number, content: string, ownerId = 2): PostComment => ({
  id,
  postId,
  ownerId,
  content,
});

// The wire row a Feed Event carries.
const wire = (c: PostComment): PostCommentWire => ({
  id: c.id,
  post_id: c.postId,
  owner_id: c.ownerId,
  content: c.content,
  cid: c.ownerId,
  ctime: "2026-10-10T12:00:00Z",
  mid: c.ownerId,
  mtime: "2026-10-10T12:00:00Z",
});

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

// A stateful fake back-end: the threads by Post id. Each write changes the
// thread, so a later read sees it.
let threads: Map<number, PostComment[]>;
let nextId: number;
const listForPostMock = vi.fn<JediApi["comments"]["listForPost"]>();
const addMock = vi.fn<JediApi["comments"]["add"]>();
const updateMock = vi.fn<JediApi["comments"]["update"]>();
const removeMock = vi.fn<JediApi["comments"]["remove"]>();
const api: JediApi["comments"] = {
  listForPost: listForPostMock,
  add: addMock,
  update: updateMock,
  remove: removeMock,
};
beforeEach(() => {
  threads = new Map([
    [1, [comment(10, 1, "first"), comment(11, 1, "second")]],
    [2, [comment(20, 2, "other post")]],
  ]);
  nextId = 100;
  const find = (id: number) => [...threads.values()].flat().find((c) => c.id === id);
  listForPostMock.mockReset();
  listForPostMock.mockImplementation((postId) =>
    Promise.resolve((threads.get(postId) ?? []).map((c) => ({ ...c }))),
  );
  addMock.mockReset();
  addMock.mockImplementation((postId, content) => {
    const added = comment(nextId++, postId, content);
    threads.set(postId, [...(threads.get(postId) ?? []), added]);
    return Promise.resolve({ ...added });
  });
  updateMock.mockReset();
  updateMock.mockImplementation((id, content) => {
    const found = find(id)!;
    found.content = content;
    return Promise.resolve({ ...found });
  });
  removeMock.mockReset();
  removeMock.mockImplementation((id) => {
    for (const [postId, list] of threads) {
      threads.set(
        postId,
        list.filter((c) => c.id !== id),
      );
    }
    return Promise.resolve();
  });
});

interface Harness {
  postComments: PostComments;
  onEvent: FeedHandler;
  select: (id: number | undefined) => void;
}

// The panel starts open, unless a test asks for it closed.
async function withThread(run: (h: Harness) => Promise<void>, { open = true } = {}) {
  await createRoot(async (dispose) => {
    const [postId, select] = createSignal<number | undefined>(1);
    const { postComments, onEvent } = createPostComments({ postId, api });
    postComments.setOpen(open);
    try {
      await run({ postComments, onEvent, select });
    } finally {
      dispose();
    }
  });
}

const contents = (postComments: PostComments) => postComments.comments()?.map((c) => c.content);

describe("createPostComments — the open state (lazy thread)", () => {
  it("makes no read and merges no Event while the panel is closed", () =>
    withThread(
      async ({ postComments, onEvent }) => {
        await tick();
        expect(postComments.open()).toBe(false);
        expect(listForPostMock).not.toHaveBeenCalled();

        onEvent({ event_type: "post_comment", payload: wire(comment(12, 1, "third")) });
        onEvent(undefined); // the resync call after a (re)connect
        await tick();
        expect(listForPostMock).not.toHaveBeenCalled();
        expect(postComments.comments()).toBeUndefined();
      },
      { open: false },
    ));

  it("loads on open, and drops the rows on close", () =>
    withThread(
      async ({ postComments }) => {
        postComments.setOpen(true);
        await tick();
        expect(contents(postComments)).toEqual(["first", "second"]);

        postComments.setOpen(false);
        expect(postComments.comments()).toBeUndefined();
        postComments.setOpen(true);
        expect(postComments.comments(), "no stale rows while it reloads").toBeUndefined();
        await tick();
        expect(listForPostMock).toHaveBeenCalledTimes(2);
        expect(contents(postComments)).toEqual(["first", "second"]);
      },
      { open: false },
    ));

  it("closes when the selected Post changes, and stays closed on a return", () =>
    withThread(async ({ postComments, select }) => {
      await tick();
      select(2);
      expect(postComments.open()).toBe(false);
      select(1);
      await tick();
      expect(postComments.open()).toBe(false);
      expect(listForPostMock).toHaveBeenCalledTimes(1);
    }));
});

describe("createPostComments — the thread read", () => {
  it("loads the selected Post's thread, and re-keys with the selection", () =>
    withThread(async ({ postComments, select }) => {
      expect(postComments.comments()).toBeUndefined();
      await tick();
      expect(contents(postComments)).toEqual(["first", "second"]);

      select(2);
      postComments.setOpen(true);
      expect(postComments.comments(), "no previous Post's thread while loading").toBeUndefined();
      await tick();
      expect(contents(postComments)).toEqual(["other post"]);
    }));

  it("has no thread while no Post is selected", () =>
    withThread(async ({ postComments, select }) => {
      select(undefined);
      await tick();
      expect(postComments.comments()).toBeUndefined();
    }));

  it("keeps each row on a reload: rows reconcile by id, never recreate", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      const [first, second] = postComments.comments()!;

      threads.get(1)![1].content = "second, edited elsewhere";
      onEvent(undefined); // the resync call after a (re)connect
      await tick();

      expect(listForPostMock).toHaveBeenCalledTimes(2);
      expect(postComments.comments()![0]).toBe(first);
      expect(postComments.comments()![1]).toBe(second);
      expect(second.content).toBe("second, edited elsewhere");
    }));

  it("shows an error when the thread fails to load", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      listForPostMock.mockRejectedValueOnce(new Error("Network down"));
      onEvent(undefined);
      await tick();
      expect(postComments.error()).toBe("Could not load the Comments");
    }));
});

describe("createPostComments — the live Events", () => {
  it("an upsert of a new Comment appends it; an upsert of a known one edits it in place", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      const first = postComments.comments()![0];

      onEvent({ event_type: "post_comment", payload: wire(comment(12, 1, "third")) });
      onEvent({
        event_type: "post_comment",
        payload: wire(comment(10, 1, "first, edited")),
      });

      expect(contents(postComments)).toEqual(["first, edited", "second", "third"]);
      expect(postComments.comments()![0]).toBe(first);
    }));

  it("a removal drops the Comment by id", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      onEvent({ event_type: "post_comment_removal", payload: { id: 10, post_id: 1 } });
      expect(contents(postComments)).toEqual(["second"]);
    }));

  it("deleted() names a Comment the shown thread dropped, and is false with no thread", () =>
    withThread(async ({ postComments, onEvent }) => {
      expect(postComments.deleted(10), "the thread still loads").toBe(false);
      await tick();
      expect(postComments.deleted(10)).toBe(false);

      onEvent({ event_type: "post_comment_removal", payload: { id: 10, post_id: 1 } });
      expect(postComments.deleted(10)).toBe(true);

      postComments.setOpen(false);
      expect(postComments.deleted(10), "no thread shows").toBe(false);
    }));

  it("ignores an upsert for another Post's thread", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      onEvent({ event_type: "post_comment", payload: wire(comment(30, 2, "elsewhere")) });
      expect(contents(postComments)).toEqual(["first", "second"]);
    }));

  it("a list that was read before a change landed is not applied: the thread reloads", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      const stale = deferred<PostComment[]>();
      listForPostMock.mockReturnValueOnce(stale.promise);
      onEvent(undefined); // a reload starts...
      onEvent({ event_type: "post_comment", payload: wire(comment(12, 1, "third")) });
      threads.get(1)!.push(comment(12, 1, "third"));
      stale.resolve([comment(10, 1, "first"), comment(11, 1, "second")]); // ...read before it
      await tick();

      expect(contents(postComments)).toEqual(["first", "second", "third"]);
    }));
});

describe("createPostComments — the writes", () => {
  it("add() posts to the selected Post and shows the new Comment at once", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      await postComments.add("hello");
      expect(addMock).toHaveBeenCalledWith(1, "hello");
      expect(contents(postComments)).toEqual(["first", "second", "hello"]);

      // The back-end's push of the same Comment does not add it twice.
      onEvent({ event_type: "post_comment", payload: wire(comment(100, 1, "hello")) });
      expect(contents(postComments)).toEqual(["first", "second", "hello"]);
    }));

  it("update() shows the edited content at once", () =>
    withThread(async ({ postComments }) => {
      await tick();
      await postComments.update(11, "second, edited");
      expect(updateMock).toHaveBeenCalledWith(11, "second, edited");
      expect(contents(postComments)).toEqual(["first", "second, edited"]);
    }));

  it("remove() drops the Comment at once", () =>
    withThread(async ({ postComments }) => {
      await tick();
      await postComments.remove(10);
      expect(removeMock).toHaveBeenCalledWith(10);
      expect(contents(postComments)).toEqual(["second"]);
    }));

  it("a failed write rejects and leaves the thread unchanged", () =>
    withThread(async ({ postComments }) => {
      await tick();
      addMock.mockRejectedValueOnce(new Error("Network down"));
      await expect(postComments.add("hello")).rejects.toThrow("Network down");
      expect(contents(postComments)).toEqual(["first", "second"]);
    }));
});
