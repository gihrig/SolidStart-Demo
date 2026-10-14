import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { createRoot, createSignal } from "solid-js";
import type { FeedHandler } from "~/lib/feed";
import type { JediApi } from "~/lib/jedi/jedi-api";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { CommentView as CommentViewWire } from "~/types/backend";
import type { CommentView } from "~/types/jedi";
import { createCommentThread, type CommentThreadState } from "./createCommentThread";

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
  thread: CommentThreadState;
  onEvent: FeedHandler;
  select: (id: number | undefined) => void;
}

// The panel starts open, unless a test asks for it closed.
async function withThread(run: (h: Harness) => Promise<void>, { open = true } = {}) {
  await createRoot(async (dispose) => {
    const [postId, select] = createSignal<number | undefined>(1);
    const { thread, onEvent } = createCommentThread({ postId, api });
    thread.setOpen(open);
    try {
      await run({ thread, onEvent, select });
    } finally {
      dispose();
    }
  });
}

const contents = (thread: CommentThreadState) => thread.comments()?.map((c) => c.contentHtml);

describe("createCommentThread — the open state (lazy thread)", () => {
  it("makes no read and merges no Event while the panel is closed", () =>
    withThread(
      async ({ thread, onEvent }) => {
        await tick();
        expect(thread.open()).toBe(false);
        expect(listForPostMock).not.toHaveBeenCalled();

        onEvent({ event_type: "post_comment", payload: wire(comment(12, 1, "third")) });
        onEvent(undefined); // the resync call after a (re)connect
        await tick();
        expect(listForPostMock).not.toHaveBeenCalled();
        expect(thread.comments()).toBeUndefined();
      },
      { open: false },
    ));

  it("loads on open, and drops the rows on close", () =>
    withThread(
      async ({ thread }) => {
        thread.setOpen(true);
        await tick();
        expect(contents(thread)).toEqual(["second", "first"]);

        thread.setOpen(false);
        expect(thread.comments()).toBeUndefined();
        thread.setOpen(true);
        expect(thread.comments(), "no stale rows while it reloads").toBeUndefined();
        await tick();
        expect(listForPostMock).toHaveBeenCalledTimes(2);
        expect(contents(thread)).toEqual(["second", "first"]);
      },
      { open: false },
    ));

  it("closes when the selected Post changes, and stays closed on a return", () =>
    withThread(async ({ thread, select }) => {
      await tick();
      select(2);
      expect(thread.open()).toBe(false);
      select(1);
      await tick();
      expect(thread.open()).toBe(false);
      expect(listForPostMock).toHaveBeenCalledTimes(1);
    }));
});

describe("createCommentThread — the thread read", () => {
  it("loads the selected Post's thread, and re-keys with the selection", () =>
    withThread(async ({ thread, select }) => {
      expect(thread.comments()).toBeUndefined();
      await tick();
      expect(contents(thread)).toEqual(["second", "first"]);

      select(2);
      thread.setOpen(true);
      expect(thread.comments(), "no previous Post's thread while loading").toBeUndefined();
      await tick();
      expect(contents(thread)).toEqual(["other post"]);
    }));

  it("has no thread while no Post is selected", () =>
    withThread(async ({ thread, select }) => {
      select(undefined);
      await tick();
      expect(thread.comments()).toBeUndefined();
    }));

  it("keeps each row on a reload: rows reconcile by id, never recreate", () =>
    withThread(async ({ thread, onEvent }) => {
      await tick();
      const [second, first] = thread.comments()!;

      threads.get(1)![0].contentHtml = "second, edited elsewhere";
      onEvent(undefined); // the resync call after a (re)connect
      await tick();

      expect(listForPostMock).toHaveBeenCalledTimes(2);
      expect(thread.comments()![0]).toBe(second);
      expect(thread.comments()![1]).toBe(first);
      expect(second.contentHtml).toBe("second, edited elsewhere");
    }));

  it("shows an error when the thread fails to load", () =>
    withThread(async ({ thread, onEvent }) => {
      await tick();
      listForPostMock.mockRejectedValueOnce(new Error("Network down"));
      onEvent(undefined);
      await tick();
      expect(thread.error()).toBe("Could not load the Comments");
    }));
});

describe("createCommentThread — the live Events", () => {
  it("an upsert of a new Comment puts it on top; an upsert of a known one edits it in place", () =>
    withThread(async ({ thread, onEvent }) => {
      await tick();
      const first = thread.comments()![1];

      onEvent({ event_type: "post_comment", payload: wire(comment(12, 1, "third")) });
      onEvent({
        event_type: "post_comment",
        payload: wire(comment(10, 1, "first, edited")),
      });

      expect(contents(thread)).toEqual(["third", "second", "first, edited"]);
      expect(thread.comments()![2]).toBe(first);
    }));

  it("a late push of an older Comment goes below a newer one", () =>
    withThread(async ({ thread, onEvent }) => {
      await tick();
      const between = { ...comment(12, 1, "between"), ctime: "2026-10-10T12:00:10.5Z" };
      onEvent({ event_type: "post_comment", payload: wire(comment(5, 1, "oldest")) });
      onEvent({ event_type: "post_comment", payload: wire(between) });

      expect(contents(thread)).toEqual(["second", "between", "first", "oldest"]);
    }));

  it("places by time, not by string order: the wire trims trailing zeros", () =>
    withThread(async ({ thread, onEvent }) => {
      await tick();
      // "…:11.1Z" sorts before "…:11Z" as a string, but it is the later time.
      const later = { ...comment(12, 1, "a tenth later"), ctime: "2026-10-10T12:00:11.1Z" };
      onEvent({ event_type: "post_comment", payload: wire(later) });

      expect(contents(thread)).toEqual(["a tenth later", "second", "first"]);
    }));

  it("breaks a time tie by id: the higher id goes first", () =>
    withThread(async ({ thread, onEvent }) => {
      await tick();
      const tie = { ...comment(12, 1, "same time as second"), ctime: at(11) };
      onEvent({ event_type: "post_comment", payload: wire(tie) });

      expect(contents(thread)).toEqual(["same time as second", "second", "first"]);
    }));

  it("an upsert with a time that does not parse throws, and leaves the thread unchanged", () =>
    withThread(async ({ thread, onEvent }) => {
      await tick();
      const bad = { ...comment(12, 1, "bad time"), ctime: "not a time" };
      expect(() => onEvent({ event_type: "post_comment", payload: wire(bad) })).toThrow(
        "Invalid Comment time: not a time",
      );
      expect(contents(thread)).toEqual(["second", "first"]);
    }));

  it("a removal drops the Comment by id", () =>
    withThread(async ({ thread, onEvent }) => {
      await tick();
      onEvent({ event_type: "post_comment_removal", payload: { id: 10, parent_id: 1 } });
      expect(contents(thread)).toEqual(["second"]);
    }));

  it("deleted() names a Comment the shown thread dropped, and is false with no thread", () =>
    withThread(async ({ thread, onEvent }) => {
      expect(thread.deleted(10), "the thread still loads").toBe(false);
      await tick();
      expect(thread.deleted(10)).toBe(false);

      onEvent({ event_type: "post_comment_removal", payload: { id: 10, parent_id: 1 } });
      expect(thread.deleted(10)).toBe(true);

      thread.setOpen(false);
      expect(thread.deleted(10), "no thread shows").toBe(false);
    }));

  it("ignores an upsert for another Post's thread", () =>
    withThread(async ({ thread, onEvent }) => {
      await tick();
      onEvent({ event_type: "post_comment", payload: wire(comment(30, 2, "elsewhere")) });
      expect(contents(thread)).toEqual(["second", "first"]);
    }));

  it("a list that was read before a change landed is not applied: the thread reloads", () =>
    withThread(async ({ thread, onEvent }) => {
      await tick();
      const stale = deferred<CommentView[]>();
      listForPostMock.mockReturnValueOnce(stale.promise);
      onEvent(undefined); // a reload starts...
      onEvent({ event_type: "post_comment", payload: wire(comment(12, 1, "third")) });
      threads.get(1)!.unshift(comment(12, 1, "third"));
      stale.resolve([comment(11, 1, "second"), comment(10, 1, "first")]); // ...read before it
      await tick();

      expect(contents(thread)).toEqual(["third", "second", "first"]);
    }));
});

describe("createCommentThread — the writes", () => {
  it("add() posts to the selected Post and shows the new Comment at once", () =>
    withThread(async ({ thread, onEvent }) => {
      await tick();
      await thread.add("hello");
      expect(addMock).toHaveBeenCalledWith(1, "hello");
      expect(contents(thread)).toEqual(["hello", "second", "first"]);

      // The back-end's push of the same Comment does not add it twice.
      onEvent({ event_type: "post_comment", payload: wire(comment(100, 1, "hello")) });
      expect(contents(thread)).toEqual(["hello", "second", "first"]);
    }));

  it("update() shows the edited content at once", () =>
    withThread(async ({ thread }) => {
      await tick();
      await thread.update(11, "second, edited");
      expect(updateMock).toHaveBeenCalledWith(11, "second, edited");
      expect(contents(thread)).toEqual(["second, edited", "first"]);
    }));

  it("remove() drops the Comment at once", () =>
    withThread(async ({ thread }) => {
      await tick();
      await thread.remove(10);
      expect(removeMock).toHaveBeenCalledWith(10);
      expect(contents(thread)).toEqual(["second"]);
    }));

  it("a failed write rejects and leaves the thread unchanged", () =>
    withThread(async ({ thread }) => {
      await tick();
      addMock.mockRejectedValueOnce(new Error("Network down"));
      await expect(thread.add("hello")).rejects.toThrow("Network down");
      expect(contents(thread)).toEqual(["second", "first"]);
    }));
});
