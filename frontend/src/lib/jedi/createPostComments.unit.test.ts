import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { createRoot, createSignal } from "solid-js";
import type { FeedHandler } from "~/lib/feed";
import type { JediApi } from "~/lib/jedi/jedi-api";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { CommentView as CommentViewWire } from "~/types/backend";
import type { CommentView } from "~/types/jedi";
import { createPostComments, type PostComments } from "./createPostComments";

// The Comment thread of the selected Post (#124). This seam test drives the
// factory with a selected Post id and a stateful fake back-end, and hands it
// Feed Events through `onEvent`; `createJediFeed.unit.test.ts` covers the Feed
// wiring around it.

// A time `seconds` after a fixed moment, as the wire writes it: trailing zeros
// trimmed. A Comment is made `id` seconds in, so a higher id is newer.
const at = (seconds: number) =>
  new Date(Date.UTC(2026, 9, 10, 12, 0, seconds)).toISOString().replace(".000Z", "Z");

const comment = (id: number, parentId: number, content: string, authorId = 2): CommentView => ({
  id,
  parentId,
  author: { id: authorId, name: `user${authorId}`, avatarUrl: trustedUrl("") },
  contentHtml: content,
  ctime: at(id),
  mtime: at(id),
});

// The wire view a Feed Event carries.
const wire = (c: CommentView): CommentViewWire => ({
  id: c.id,
  parent_id: c.parentId,
  author: { id: c.author.id, name: c.author.name, avatar_url: null },
  content_html: c.contentHtml,
  ctime: c.ctime,
  mtime: c.mtime,
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

// A stateful fake back-end: the threads by Post id, newest first. Each write
// changes the thread, so a later read sees it.
let threads: Map<number, CommentView[]>;
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
  source: () => Promise.reject(new Error("not used here")),
};
beforeEach(() => {
  threads = new Map([
    [1, [comment(11, 1, "second"), comment(10, 1, "first")]],
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
    threads.set(postId, [added, ...(threads.get(postId) ?? [])]);
    return Promise.resolve({ ...added });
  });
  updateMock.mockReset();
  updateMock.mockImplementation((id, content) => {
    const found = find(id)!;
    found.contentHtml = content;
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

const contents = (postComments: PostComments) => postComments.comments()?.map((c) => c.contentHtml);

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
        expect(contents(postComments)).toEqual(["second", "first"]);

        postComments.setOpen(false);
        expect(postComments.comments()).toBeUndefined();
        postComments.setOpen(true);
        expect(postComments.comments(), "no stale rows while it reloads").toBeUndefined();
        await tick();
        expect(listForPostMock).toHaveBeenCalledTimes(2);
        expect(contents(postComments)).toEqual(["second", "first"]);
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
      expect(contents(postComments)).toEqual(["second", "first"]);

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
      const [second, first] = postComments.comments()!;

      threads.get(1)![0].contentHtml = "second, edited elsewhere";
      onEvent(undefined); // the resync call after a (re)connect
      await tick();

      expect(listForPostMock).toHaveBeenCalledTimes(2);
      expect(postComments.comments()![0]).toBe(second);
      expect(postComments.comments()![1]).toBe(first);
      expect(second.contentHtml).toBe("second, edited elsewhere");
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
  it("an upsert of a new Comment puts it on top; an upsert of a known one edits it in place", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      const first = postComments.comments()![1];

      onEvent({ event_type: "post_comment", payload: wire(comment(12, 1, "third")) });
      onEvent({
        event_type: "post_comment",
        payload: wire(comment(10, 1, "first, edited")),
      });

      expect(contents(postComments)).toEqual(["third", "second", "first, edited"]);
      expect(postComments.comments()![2]).toBe(first);
    }));

  it("a late push of an older Comment goes below a newer one", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      const between = { ...comment(12, 1, "between"), ctime: "2026-10-10T12:00:10.5Z" };
      onEvent({ event_type: "post_comment", payload: wire(comment(5, 1, "oldest")) });
      onEvent({ event_type: "post_comment", payload: wire(between) });

      expect(contents(postComments)).toEqual(["second", "between", "first", "oldest"]);
    }));

  it("places by time, not by string order: the wire trims trailing zeros", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      // "…:11.1Z" sorts before "…:11Z" as a string, but it is the later time.
      const later = { ...comment(12, 1, "a tenth later"), ctime: "2026-10-10T12:00:11.1Z" };
      onEvent({ event_type: "post_comment", payload: wire(later) });

      expect(contents(postComments)).toEqual(["a tenth later", "second", "first"]);
    }));

  it("breaks a time tie by id: the higher id goes first", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      const tie = { ...comment(12, 1, "same time as second"), ctime: at(11) };
      onEvent({ event_type: "post_comment", payload: wire(tie) });

      expect(contents(postComments)).toEqual(["same time as second", "second", "first"]);
    }));

  it("an upsert with a time that does not parse throws, and leaves the thread unchanged", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      const bad = { ...comment(12, 1, "bad time"), ctime: "not a time" };
      expect(() => onEvent({ event_type: "post_comment", payload: wire(bad) })).toThrow(
        "Invalid Comment time: not a time",
      );
      expect(contents(postComments)).toEqual(["second", "first"]);
    }));

  it("a removal drops the Comment by id", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      onEvent({ event_type: "post_comment_removal", payload: { id: 10, parent_id: 1 } });
      expect(contents(postComments)).toEqual(["second"]);
    }));

  it("deleted() names a Comment the shown thread dropped, and is false with no thread", () =>
    withThread(async ({ postComments, onEvent }) => {
      expect(postComments.deleted(10), "the thread still loads").toBe(false);
      await tick();
      expect(postComments.deleted(10)).toBe(false);

      onEvent({ event_type: "post_comment_removal", payload: { id: 10, parent_id: 1 } });
      expect(postComments.deleted(10)).toBe(true);

      postComments.setOpen(false);
      expect(postComments.deleted(10), "no thread shows").toBe(false);
    }));

  it("ignores an upsert for another Post's thread", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      onEvent({ event_type: "post_comment", payload: wire(comment(30, 2, "elsewhere")) });
      expect(contents(postComments)).toEqual(["second", "first"]);
    }));

  it("a list that was read before a change landed is not applied: the thread reloads", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      const stale = deferred<CommentView[]>();
      listForPostMock.mockReturnValueOnce(stale.promise);
      onEvent(undefined); // a reload starts...
      onEvent({ event_type: "post_comment", payload: wire(comment(12, 1, "third")) });
      threads.get(1)!.unshift(comment(12, 1, "third"));
      stale.resolve([comment(11, 1, "second"), comment(10, 1, "first")]); // ...read before it
      await tick();

      expect(contents(postComments)).toEqual(["third", "second", "first"]);
    }));
});

describe("createPostComments — the writes", () => {
  it("add() posts to the selected Post and shows the new Comment at once", () =>
    withThread(async ({ postComments, onEvent }) => {
      await tick();
      await postComments.add("hello");
      expect(addMock).toHaveBeenCalledWith(1, "hello");
      expect(contents(postComments)).toEqual(["hello", "second", "first"]);

      // The back-end's push of the same Comment does not add it twice.
      onEvent({ event_type: "post_comment", payload: wire(comment(100, 1, "hello")) });
      expect(contents(postComments)).toEqual(["hello", "second", "first"]);
    }));

  it("update() shows the edited content at once", () =>
    withThread(async ({ postComments }) => {
      await tick();
      await postComments.update(11, "second, edited");
      expect(updateMock).toHaveBeenCalledWith(11, "second, edited");
      expect(contents(postComments)).toEqual(["second, edited", "first"]);
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
      expect(contents(postComments)).toEqual(["second", "first"]);
    }));
});
