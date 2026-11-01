import { describe, it, expect, vi } from "vite-plus/test";
import { batch, createRoot, createSignal } from "solid-js";
import { createDraftGuard, createDraftScope, type DraftGuard } from "~/lib/createDraftGuard";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { AuthorRef, CaptionView, JediCategory, PostView } from "~/types/jedi";
import { createSelection, type SelectionCalls, type SelectionState } from "./createSelection";

// The selection of the Post card (#271): the Post and the Caption shown, the
// Post hold, the Caption hold, the guarded moves, the change causes and the
// Owner's writes. Each test drives it through its interface, with plain
// signals for the Posts and the filter, and stand-in back-end calls.

const LANDSCAPE: JediCategory = { id: 1, name: "Landscape", icon: "landscape" };
const PEOPLE: JediCategory = { id: 2, name: "People", icon: "portrait" };
const ANIMALS: JediCategory = { id: 3, name: "Animals", icon: "dog" };
// The filter rows: index 0 is "All".
const CATEGORY_ROWS = [undefined, LANDSCAPE, PEOPLE, ANIMALS];
const LANDSCAPE_ROW = 1;
const PEOPLE_ROW = 2;
const ANIMALS_ROW = 3;

const LISA: AuthorRef = { id: 1, name: "Lisa", avatarUrl: trustedUrl("") };

const post = (id: number, categories: JediCategory[]): PostView => ({
  id,
  author: LISA,
  title: `Post ${id}`,
  imageSrc: trustedUrl(`https://example.test/${id}.jpg`),
  imageAlt: `Post ${id}`,
  photographer: "Photographer",
  photographerUrl: trustedUrl("https://example.test/photographer"),
  sourceUrl: trustedUrl("https://example.test/source"),
  categories,
  likeCount: 0,
  commentCount: 0,
});
// The Posts as the back-end ranks them: Posts 1 and 3 in Animals, Posts 2 and
// 4 in Landscape.
const RANKED = [post(1, [ANIMALS]), post(3, [ANIMALS]), post(2, [LANDSCAPE]), post(4, [LANDSCAPE])];
// After a re-rank: Post 3 first.
const RE_RANKED = [RANKED[1], RANKED[0], ...RANKED.slice(2)];
// After another User's edit: Post 1 is only in Landscape.
const POST_1_LEFT_ANIMALS = RANKED.map((p) => (p.id === 1 ? post(1, [LANDSCAPE]) : p));
// After a delete: Post 1 is gone.
const WITHOUT_POST_1 = RANKED.slice(1);

const caption = (id: number, postId: number): CaptionView => ({
  id,
  postId,
  author: LISA,
  text: `Caption ${id}`,
  likeCount: 0,
  commentCount: 0,
});
// The ranked Captions of each Post: Post 1 has Captions 1 and 2.
const CAPTIONS: Record<number, CaptionView[]> = {
  1: [caption(1, 1), caption(2, 1)],
  2: [caption(3, 2)],
  3: [caption(4, 3)],
  4: [],
};

const POST_DELETED = "This Post was deleted. Your unsaved changes were discarded.";
const CAPTION_DELETED = "This Caption was deleted. Your unsaved changes were discarded.";
const LEFT_QUESTION = "This Post is no longer in Animals. Your unsaved changes may not apply.";
const LEFT = "This Post is no longer in Animals.";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const settle = async () => {
  await tick();
  await tick();
};

interface Harness {
  selection: SelectionState;
  guard: DraftGuard;
  calls: { [K in keyof SelectionCalls]: ReturnType<typeof vi.fn<SelectionCalls[K]>> };
  refetchPosts: ReturnType<typeof vi.fn<() => void>>;
  categoryIndex: () => number;
  /** A new Post list, as a refetch delivers it: the cause check runs first. */
  load: (list: PostView[]) => void;
  /** New Captions for Post `postId`, as a `post_caption` refetch delivers them. */
  loadCaptions: (postId: number, captions: CaptionView[]) => Promise<void>;
  /** A Draft reported under a new key, in `scope`. */
  draft: (scope?: ReturnType<typeof createDraftScope>) => symbol;
}

async function withSelection(run: (h: Harness) => void | Promise<void>) {
  const captions = { ...CAPTIONS };
  await createRoot(async (dispose) => {
    try {
      const [posts, setPosts] = createSignal<PostView[] | undefined>(RANKED);
      const [categoryIndex, setCategoryIndex] = createSignal(0);
      const filterCategory = (index: number) => CATEGORY_ROWS[index];
      const visiblePostsIn = (index: number) => {
        const all = posts();
        const category = filterCategory(index);
        if (!all || !category) return all;
        return all.filter((p) => p.categories.some((c) => c.id === category.id));
      };
      const calls = {
        listCaptions: vi.fn((postId: number) => Promise.resolve(captions[postId] ?? [])),
        updatePost: vi.fn(() => Promise.resolve()),
        removePost: vi.fn(() => Promise.resolve()),
        updateCaption: vi.fn(() => Promise.resolve()),
        removeCaption: vi.fn(() => Promise.resolve()),
      };
      const refetchPosts = vi.fn();
      const guard = createDraftGuard();
      const selection = createSelection({
        posts,
        visiblePostsIn,
        filterCategory,
        categoryIndex,
        setCategoryIndex,
        refetchPosts,
        calls,
        guard,
      });
      await settle();
      await run({
        selection,
        guard,
        calls,
        refetchPosts,
        categoryIndex,
        load: (list) => {
          selection.checkPosts(list);
          setPosts(list);
        },
        loadCaptions: async (postId, list) => {
          captions[postId] = list;
          selection.refetchCaptions();
          await settle();
        },
        draft: (scope) => {
          const key = Symbol("draft");
          guard.report(key, true, scope);
          return key;
        },
      });
    } finally {
      dispose();
    }
  });
}

const shownPost = (s: SelectionState) => s.selectedPost()?.id;
const shownCaption = (s: SelectionState) => s.selectedCaption()?.id;

describe("createSelection — the Post shown", () => {
  it("is the top-ranked Post in the filter, then the picked Post while the filter lists it", () =>
    withSelection(({ selection }) => {
      expect(shownPost(selection)).toBe(1);
      selection.selectPost(2);
      expect(shownPost(selection)).toBe(2);
      selection.setSelectedCategory(ANIMALS_ROW);
      expect(shownPost(selection), "the filter hides the pick").toBe(1);
      selection.selectPost(3);
      expect(shownPost(selection)).toBe(3);
    }));

  it("an empty Category shows no Post, and no Captions", () =>
    withSelection(({ selection }) => {
      selection.setSelectedCategory(PEOPLE_ROW);
      expect(selection.selectedPost()).toBeUndefined();
      expect(selection.visibleCaptions()).toEqual([]);
    }));

  it("the scopes: the Caption scope sits under the Post scope", () =>
    withSelection(({ selection, guard, draft }) => {
      draft(selection.draftScopes.caption);
      expect(guard.hasDraftIn(selection.draftScopes.post)).toBe(true);
    }));
});

describe("createSelection — the Captions shown", () => {
  it("shows the ranked Captions of the Post shown; the winner, then the pick", () =>
    withSelection(({ selection }) => {
      expect(selection.visibleCaptions()?.map((c) => c.id)).toEqual([1, 2]);
      expect(shownCaption(selection)).toBe(1);
      selection.selectCaption(2);
      expect(shownCaption(selection)).toBe(2);
    }));

  it("re-keys on a Post change: the pick falls back to the new Post's winner", () =>
    withSelection(async ({ selection }) => {
      selection.selectCaption(2);
      selection.selectPost(2);
      await settle();
      expect(selection.visibleCaptions()?.map((c) => c.id)).toEqual([3]);
      expect(shownCaption(selection)).toBe(3);
    }));

  it("shows no Captions of the previous Post while the new Post's Captions load", () =>
    withSelection(async ({ selection, calls }) => {
      let release!: () => void;
      calls.listCaptions.mockImplementationOnce(
        (postId) => new Promise((resolve) => (release = () => resolve(CAPTIONS[postId]))),
      );
      selection.selectPost(2);
      await settle();
      expect(selection.visibleCaptions()).toBeUndefined();
      expect(selection.selectedCaption()).toBeUndefined();

      release();
      await settle();
      expect(shownCaption(selection)).toBe(3);
    }));

  it("an empty list of the previous Post does not read as the new Post's (#185 review)", () =>
    withSelection(async ({ selection, calls }) => {
      selection.selectPost(4);
      await settle();
      expect(selection.visibleCaptions(), "Post 4: loaded, none").toEqual([]);

      let release!: () => void;
      calls.listCaptions.mockImplementationOnce(
        (postId) => new Promise((resolve) => (release = () => resolve(CAPTIONS[postId]))),
      );
      selection.selectPost(2);
      await settle();
      expect(selection.visibleCaptions(), "Post 2: still loading").toBeUndefined();
      release();
      await settle();
      expect(selection.visibleCaptions()).toEqual(CAPTIONS[2]);
    }));
});

describe("createSelection — the Post hold", () => {
  it("a Draft in the Post scope keeps the Post shown across a re-rank, until it ends", () =>
    withSelection(({ selection, guard, load, draft }) => {
      const key = draft(selection.draftScopes.post);
      load(RE_RANKED);
      expect(shownPost(selection), "the Post card stays").toBe(1);

      guard.report(key, false);
      expect(shownPost(selection), "it follows the ranking again").toBe(3);
    }));

  it("a Draft in a scope under the Post scope starts it too", () =>
    withSelection(({ selection, load, draft }) => {
      draft(createDraftScope("post-thread", selection.draftScopes.post));
      load(RE_RANKED);
      expect(shownPost(selection)).toBe(1);
    }));

  it("an open Post edit starts it, with no Draft", () =>
    withSelection(({ selection, guard, load }) => {
      selection.postOwner.edit.setOpen(true);
      load(RE_RANKED);
      expect(guard.hasDraft()).toBe(false);
      expect(shownPost(selection)).toBe(1);

      selection.postOwner.edit.setOpen(false);
      expect(shownPost(selection)).toBe(3);
    }));

  it("a Draft outside the Post scope, such as the New Post Draft, does not start it (#214)", () =>
    withSelection(({ selection, load, draft }) => {
      draft();
      load(RE_RANKED);
      expect(shownPost(selection)).toBe(3);
    }));
});

describe("createSelection — an open Comments panel starts a Post hold (#271)", () => {
  // Each panel, and the subject it opens on: Post 1, or its Caption 1.
  const PANELS = [
    ["post", 1],
    ["caption", 1],
  ] as const;
  const openPanel = (selection: SelectionState, panel: "post" | "caption", on: number) => {
    const [, setOpenOn] = selection.threadOpenOn[panel];
    setOpenOn(on);
    return () => setOpenOn(undefined);
  };

  it.each(PANELS)(
    "an open %s panel keeps the Post shown across a re-rank, with no Draft, until it closes",
    (panel, on) =>
      withSelection(({ selection, guard, load }) => {
        const close = openPanel(selection, panel, on);
        load(RE_RANKED);
        expect(guard.hasDraft()).toBe(false);
        expect(shownPost(selection), "the Post card stays").toBe(1);

        close();
        expect(shownPost(selection), "it follows the ranking again").toBe(3);
      }),
  );

  it.each(PANELS)(
    "with an open %s panel and no Draft, a Post that leaves the Category stays shown with no question; after the close, it moves and speaks",
    (panel, on) =>
      withSelection(async ({ selection, guard, load }) => {
        selection.setSelectedCategory(ANIMALS_ROW);
        const close = openPanel(selection, panel, on);
        load(POST_1_LEFT_ANIMALS);
        await settle();
        expect(guard.pending(), "no question").toBe(false);
        expect(shownPost(selection)).toBe(1);

        close();
        await settle();
        expect(shownPost(selection)).toBe(3);
        expect(selection.announcement()).toBe(LEFT);
      }),
  );

  it.each(PANELS)(
    "Discard on the Category question also closes an open %s panel, and the Post card moves",
    (panel, on) =>
      withSelection(async ({ selection, guard, load, draft }) => {
        selection.setSelectedCategory(ANIMALS_ROW);
        openPanel(selection, panel, on);
        draft(selection.draftScopes.post);
        load(POST_1_LEFT_ANIMALS);
        expect(guard.question()).toBe(LEFT_QUESTION);

        guard.confirmMove();
        await settle();
        const [openOn] = selection.threadOpenOn[panel];
        expect(openOn(), "the panel closes").toBeUndefined();
        expect(shownPost(selection)).toBe(3);
        expect(selection.announcement()).toBe(LEFT);
      }),
  );

  it.each(PANELS)(
    "with an open %s panel, a deleted Post still moves, and the live region speaks",
    (panel, on) =>
      withSelection(async ({ selection, guard, load }) => {
        openPanel(selection, panel, on);
        load(WITHOUT_POST_1);
        await settle();
        expect(guard.notice()).toBeUndefined();
        expect(shownPost(selection)).toBe(3);
        expect(selection.announcement()).toBe("This Post was deleted.");
      }),
  );

  it.each(PANELS)(
    "with an open %s panel, a Top Photo click or a Category change by the User still moves the Post card",
    (panel, on) =>
      withSelection(({ selection }) => {
        openPanel(selection, panel, on);
        selection.selectPost(2);
        expect(shownPost(selection)).toBe(2);

        selection.selectPost(1);
        openPanel(selection, panel, on);
        selection.setSelectedCategory(LANDSCAPE_ROW);
        expect(shownPost(selection)).toBe(2);
      }),
  );

  it("a switch between the panels in one step keeps the Post shown after a re-rank", () =>
    withSelection(({ selection, load }) => {
      const [, setPostOn] = selection.threadOpenOn.post;
      const [, setCaptionOn] = selection.threadOpenOn.caption;
      setPostOn(1);
      load(RE_RANKED);
      batch(() => {
        setCaptionOn(1);
        setPostOn(undefined);
      });
      expect(shownPost(selection)).toBe(1);
      batch(() => {
        setPostOn(1);
        setCaptionOn(undefined);
      });
      expect(shownPost(selection)).toBe(1);
    }));
});

describe("createSelection — the Caption hold", () => {
  it("an open Caption Comments panel keeps the Caption shown across a re-rank", () =>
    withSelection(async ({ selection, loadCaptions }) => {
      const [, setThreadOpenOn] = selection.threadOpenOn.caption;
      setThreadOpenOn(1);
      await loadCaptions(1, [caption(2, 1), caption(1, 1)]);
      expect(shownCaption(selection)).toBe(1);

      setThreadOpenOn(undefined);
      expect(shownCaption(selection), "it follows the ranking again").toBe(2);
    }));

  it("an open Caption edit keeps the Caption shown across a re-rank", () =>
    withSelection(async ({ selection, loadCaptions }) => {
      selection.captionOwner.edit.setOpen(true);
      await loadCaptions(1, [caption(2, 1), caption(1, 1)]);
      expect(shownCaption(selection)).toBe(1);
      expect(selection.captionOwner.edit.open()).toBe(true);

      selection.captionOwner.edit.setOpen(false);
      expect(shownCaption(selection)).toBe(2);
    }));
});

describe("createSelection — the guarded moves (ADR-0030)", () => {
  it("a Top Photo click with a Draft on the Post waits for the confirm; a click on the Post shown is no move", () =>
    withSelection(({ selection, guard, draft }) => {
      draft(selection.draftScopes.post);
      selection.selectPost(1);
      expect(guard.pending()).toBe(false);

      selection.selectPost(2);
      expect(guard.pending()).toBe(true);
      expect(shownPost(selection)).toBe(1);
      guard.confirmMove();
      expect(shownPost(selection)).toBe(2);
    }));

  it("a Category change asks only when it changes the Post shown", () =>
    withSelection(({ selection, guard, categoryIndex, draft }) => {
      draft(selection.draftScopes.post);
      selection.setSelectedCategory(ANIMALS_ROW);
      expect(guard.pending()).toBe(false);
      expect(categoryIndex()).toBe(ANIMALS_ROW);

      selection.setSelectedCategory(LANDSCAPE_ROW);
      expect(guard.pending()).toBe(true);
      expect(categoryIndex()).toBe(ANIMALS_ROW);
      guard.confirmMove();
      expect(categoryIndex()).toBe(LANDSCAPE_ROW);
      expect(shownPost(selection)).toBe(2);
      expect(selection.announcement(), "a User's own move says nothing").toBe("");
    }));

  it("a Caption pick asks in the Caption scope, and about the scopes under it", () =>
    withSelection(({ selection, guard, draft }) => {
      draft(selection.draftScopes.post);
      selection.selectCaption(2);
      expect(guard.pending(), "a Draft in the Post scope only").toBe(false);
      expect(shownCaption(selection)).toBe(2);

      const thread = draft(createDraftScope("caption-thread", selection.draftScopes.caption));
      selection.selectCaption(2);
      expect(guard.pending(), "a pick of the Caption shown is no move").toBe(false);
      selection.selectCaption(1);
      expect(guard.pending(), "a Draft under the Caption scope").toBe(true);
      guard.cancelMove();
      guard.report(thread, false);

      draft(selection.draftScopes.caption);
      selection.selectCaption(1);
      expect(guard.pending(), "a Draft in the Caption scope").toBe(true);
      guard.confirmMove();
      expect(shownCaption(selection)).toBe(1);
    }));
});

describe("createSelection — the edits (#187)", () => {
  it("a change of the Post or the Caption shown closes its edit, and a return does not reopen it", () =>
    withSelection(async ({ selection }) => {
      selection.captionOwner.edit.setOpen(true);
      selection.selectCaption(2);
      await settle();
      expect(selection.captionOwner.edit.open()).toBe(false);

      selection.postOwner.edit.setOpen(true);
      selection.selectPost(2);
      await settle();
      expect(selection.postOwner.edit.open()).toBe(false);
      selection.selectPost(1);
      await settle();
      expect(selection.postOwner.edit.open()).toBe(false);
    }));

  it("a refetch of the Post shown, the same id, keeps its edit open", () =>
    withSelection(({ selection, load }) => {
      selection.postOwner.edit.setOpen(true);
      load(RANKED.map((p) => ({ ...p })));
      expect(selection.postOwner.edit.open()).toBe(true);
    }));
});

describe("createSelection — a Post change by another User (#187)", () => {
  it("a deleted Post discards the Drafts in the Post scope with the notice; the Post card moves", () =>
    withSelection(({ selection, guard, load, draft }) => {
      const outside = draft();
      draft(createDraftScope("caption-thread", selection.draftScopes.caption));
      load(WITHOUT_POST_1);
      expect(guard.notice()).toBe(POST_DELETED);
      expect(guard.hasDraftIn(selection.draftScopes.post)).toBe(false);
      expect(guard.holds(outside), "a Draft outside the Post stays").toBe(true);
      expect(shownPost(selection)).toBe(3);
    }));

  it("a viewer without a Draft on the Post hears the delete, with no notice", () =>
    withSelection(async ({ selection, guard, load }) => {
      load(WITHOUT_POST_1);
      await settle();
      expect(guard.notice()).toBeUndefined();
      expect(selection.announcement()).toBe("This Post was deleted.");
    }));

  it("a refetch that keeps the Post and the Caption shown says nothing", () =>
    withSelection(async ({ selection, guard, load, loadCaptions, draft }) => {
      draft(selection.draftScopes.post);
      load(RANKED);
      await loadCaptions(1, CAPTIONS[1]);
      expect(guard.notice()).toBeUndefined();
      expect(guard.pending()).toBe(false);
      expect(selection.announcement()).toBe("");
    }));

  it("a held Post that leaves the Category stays shown and asks once; when the Post hold ends, it moves and speaks", () =>
    withSelection(async ({ selection, guard, load, draft }) => {
      selection.setSelectedCategory(ANIMALS_ROW);
      const key = draft(selection.draftScopes.post);
      load(POST_1_LEFT_ANIMALS);
      expect(shownPost(selection), "the Post stays shown").toBe(1);
      expect(guard.question()).toBe(LEFT_QUESTION);

      guard.cancelMove();
      load(POST_1_LEFT_ANIMALS);
      expect(guard.pending(), "once per leave").toBe(false);

      guard.report(key, false);
      await settle();
      expect(shownPost(selection)).toBe(3);
      expect(selection.announcement()).toBe(LEFT);
    }));

  it("Discard on the Category question drops the Drafts, closes the Post edit, and the Post card moves", () =>
    withSelection(async ({ selection, guard, load, draft }) => {
      selection.setSelectedCategory(ANIMALS_ROW);
      selection.postOwner.edit.setOpen(true);
      draft(selection.draftScopes.post);
      load(POST_1_LEFT_ANIMALS);

      guard.confirmMove();
      await settle();
      expect(guard.hasDraft()).toBe(false);
      expect(selection.postOwner.edit.open()).toBe(false);
      expect(shownPost(selection)).toBe(3);
      expect(selection.announcement()).toBe(LEFT);
    }));

  it("an open Post edit with no Draft keeps the Post with no question, until it closes", () =>
    withSelection(async ({ selection, guard, load }) => {
      selection.setSelectedCategory(ANIMALS_ROW);
      selection.postOwner.edit.setOpen(true);
      load(POST_1_LEFT_ANIMALS);
      expect(guard.pending()).toBe(false);
      expect(shownPost(selection)).toBe(1);

      selection.postOwner.edit.setOpen(false);
      await settle();
      expect(shownPost(selection)).toBe(3);
      expect(selection.announcement()).toBe(LEFT);
    }));

  it("with no Post hold, the Post card moves and the live region says why", () =>
    withSelection(async ({ selection, guard, load, draft }) => {
      selection.setSelectedCategory(ANIMALS_ROW);
      draft();
      load(POST_1_LEFT_ANIMALS);
      await settle();
      expect(guard.pending(), "a Draft outside the Post is not asked about").toBe(false);
      expect(shownPost(selection)).toBe(3);
      expect(selection.announcement()).toBe(LEFT);
    }));

  it("a held Post that leaves its Category empty stays shown", () =>
    withSelection(async ({ selection, load, draft }) => {
      selection.setSelectedCategory(ANIMALS_ROW);
      draft(selection.draftScopes.post);
      load(RANKED.map((p) => post(p.id, [LANDSCAPE])));
      expect(shownPost(selection)).toBe(1);
    }));

  it("a User's own Category change does not keep the held Post: it asks, then moves", () =>
    withSelection(({ selection, guard, load, draft }) => {
      selection.setSelectedCategory(ANIMALS_ROW);
      draft(selection.draftScopes.post);
      load(POST_1_LEFT_ANIMALS);
      guard.cancelMove();

      selection.setSelectedCategory(ANIMALS_ROW);
      expect(guard.pending()).toBe(true);
      guard.confirmMove();
      expect(shownPost(selection)).toBe(3);
    }));

  it("a Post delete while the Category question is open shows the Post notice instead", () =>
    withSelection(({ selection, guard, load, draft }) => {
      selection.setSelectedCategory(ANIMALS_ROW);
      draft(selection.draftScopes.post);
      load(POST_1_LEFT_ANIMALS);
      expect(guard.pending()).toBe(true);

      load(WITHOUT_POST_1);
      expect(guard.pending()).toBe(false);
      expect(guard.notice()).toBe(POST_DELETED);
    }));
});

describe("createSelection — a Caption delete by another User (#187)", () => {
  it("discards the Drafts in the Caption scope with the notice; a Draft outside it stays", () =>
    withSelection(async ({ selection, guard, loadCaptions, draft }) => {
      const outside = draft(selection.draftScopes.post);
      draft(selection.draftScopes.caption);
      draft(createDraftScope("caption-thread", selection.draftScopes.caption));
      await loadCaptions(1, [caption(2, 1)]);
      expect(guard.notice()).toBe(CAPTION_DELETED);
      expect(guard.hasDraftIn(selection.draftScopes.caption)).toBe(false);
      expect(guard.holds(outside)).toBe(true);
      expect(shownCaption(selection)).toBe(2);
    }));

  it("a viewer without a Draft on the Caption hears its delete", () =>
    withSelection(async ({ selection, guard, loadCaptions }) => {
      await loadCaptions(1, [caption(2, 1)]);
      expect(guard.notice()).toBeUndefined();
      expect(selection.announcement()).toBe("This Caption was deleted.");
    }));
});

describe("createSelection — the Owner's writes (#187)", () => {
  it("the Post delete releases the Drafts in the Post scope, shows no notice, refetches and speaks", () =>
    withSelection(async ({ selection, guard, calls, refetchPosts, load, draft }) => {
      const outside = draft();
      draft(selection.draftScopes.post);
      expect(selection.postOwner.removeDiscardsDraft()).toBe(true);
      let answer!: () => void;
      calls.removePost.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));

      const deleted = selection.postOwner.remove(1);
      expect(calls.removePost).toHaveBeenCalledWith(1);
      expect(guard.hasDraftIn(selection.draftScopes.post), "released at the confirm").toBe(false);
      // The poke can arrive before the delete result (ADR-0016).
      load(WITHOUT_POST_1);
      answer();
      await deleted;
      await settle();

      expect(guard.notice()).toBeUndefined();
      expect(guard.holds(outside), "a Draft outside the Post stays").toBe(true);
      expect(refetchPosts).toHaveBeenCalledOnce();
      expect(selection.announcement()).toBe("Post deleted.");
    }));

  it("a failed Post delete holds the Drafts again and rejects", () =>
    withSelection(async ({ selection, guard, calls, draft }) => {
      draft(selection.draftScopes.post);
      calls.removePost.mockRejectedValueOnce(new Error("Could not delete the Post"));
      await expect(selection.postOwner.remove(1)).rejects.toThrow("Could not delete the Post");
      expect(guard.hasDraft()).toBe(true);
    }));

  it("a delete of a subject that is no longer shown deletes nothing and rejects", () =>
    withSelection(async ({ selection, calls }) => {
      await expect(selection.postOwner.remove(3)).rejects.toThrow(
        "The Post shown changed. Nothing was deleted.",
      );
      await expect(selection.captionOwner.remove(2)).rejects.toThrow(
        "The Caption shown changed. Nothing was deleted.",
      );
      expect(calls.removePost).not.toHaveBeenCalled();
      expect(calls.removeCaption).not.toHaveBeenCalled();
    }));

  it("the Caption delete releases the Caption scope and the scopes under it, refetches and speaks", () =>
    withSelection(async ({ selection, guard, calls, draft }) => {
      const outside = draft(selection.draftScopes.post);
      expect(selection.captionOwner.removeDiscardsDraft()).toBe(false);
      const edit = draft(selection.draftScopes.caption);
      const thread = draft(createDraftScope("caption-thread", selection.draftScopes.caption));
      expect(selection.captionOwner.removeDiscardsDraft()).toBe(true);
      const loads = calls.listCaptions.mock.calls.length;

      await selection.captionOwner.remove(1);
      await settle();
      expect(calls.removeCaption).toHaveBeenCalledWith(1);
      expect(guard.holds(edit)).toBe(false);
      expect(guard.holds(thread)).toBe(false);
      expect(guard.holds(outside)).toBe(true);
      expect(guard.notice()).toBeUndefined();
      expect(calls.listCaptions.mock.calls.length).toBeGreaterThan(loads);
      expect(selection.announcement()).toBe("Caption deleted.");
    }));

  it("the Post save sends the changes, refetches and speaks; a repeat is spoken again", () =>
    withSelection(async ({ selection, calls, refetchPosts }) => {
      await selection.postOwner.save(1, { title: "Big Jedi" });
      expect(calls.updatePost).toHaveBeenCalledWith(1, { title: "Big Jedi" });
      expect(refetchPosts).toHaveBeenCalledOnce();
      await settle();
      expect(selection.announcement()).toBe("Post saved.");

      const saved = selection.postOwner.save(1, { title: "Bigger Jedi" });
      await Promise.resolve();
      expect(selection.announcement(), "the live region clears first").toBe("");
      await saved;
      await settle();
      expect(selection.announcement()).toBe("Post saved.");
    }));

  it("a Post save that drops the selected Category switches the filter to All when it is sent", () =>
    withSelection(async ({ selection, guard, calls, categoryIndex, draft }) => {
      selection.setSelectedCategory(ANIMALS_ROW);
      draft(selection.draftScopes.post);
      let answer!: () => void;
      calls.updatePost.mockReturnValueOnce(
        new Promise((resolve) => (answer = () => resolve(undefined))),
      );
      const saved = selection.postOwner.save(1, { categoryIds: [LANDSCAPE.id] });

      expect(categoryIndex()).toBe(0);
      expect(shownPost(selection)).toBe(1);
      expect(guard.pending(), "no question").toBe(false);
      answer();
      await saved;
    }));

  it("the Caption save sends the text, refetches and speaks", () =>
    withSelection(async ({ selection, calls }) => {
      const loads = calls.listCaptions.mock.calls.length;
      await selection.captionOwner.save(1, "New text");
      await settle();
      expect(calls.updateCaption).toHaveBeenCalledWith(1, "New text");
      expect(calls.listCaptions.mock.calls.length).toBeGreaterThan(loads);
      expect(selection.announcement()).toBe("Caption saved.");
    }));
});
