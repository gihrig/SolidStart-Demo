import { createResource, createSignal, type Accessor, type Setter } from "solid-js";
import { jediApi } from "~/lib/jedi/jedi-api";
import type { JediCategory, PostView, CaptionView, JediHero, AuthorRef } from "~/types/jedi";

/**
 * The Jedi feed's view-model: it owns the route's four data resources and the
 * derivations over them, exposing a small accessor interface. The route reads
 * these accessors and renders — no data orchestration in the markup — so the
 * derivations are exercisable at this seam without rendering the DOM, the same
 * way `jedi-api` is tested through its interface.
 *
 * `selectedCategory` is an index into `categories()`, whose row 0 is the
 * synthetic "All" filter row (#33-b). `visiblePosts` filters `posts` behind it;
 * the Top Photos card renders whatever it is handed and stays presentational.
 *
 * `selectedPost` is the post shown in the main article (#29): it defaults to the
 * top-ranked *visible* post and follows `selectPost(id)` when a Top Photo is
 * clicked, so a category filter that hides the selection moves the article to a
 * post the sidebar actually lists. `topCaptions` re-keys off it, so the
 * captions and the rest of the article's metadata track the selection.
 *
 * `selectedCaption` is the caption shown under the post (#33): it defaults to
 * the `winningCaption` and follows `selectCaption(id)`. Like `selectedPost` it
 * self-resets — the old caption's id is absent from the new post's captions, so
 * it falls back to that post's winner.
 *
 * `hero` (the header banner content) and `profile` (the nav avatar's current
 * user) are the externalized header/hero data (#32): the route renders the Hero
 * from `hero` and hands `profile` to `<JediNav />`, so neither is hard-coded in
 * the markup.
 */
export interface JediFeed {
  /** The real categories behind an "All" row at index 0 (`selectedCategory`). */
  categories: Accessor<JediCategory[] | undefined>;
  posts: Accessor<PostView[] | undefined>;
  /** `posts` filtered to `selectedCategory` — what Top Photos renders (#33-b). */
  visiblePosts: Accessor<PostView[] | undefined>;
  featured: Accessor<PostView | undefined>;
  selectedPost: Accessor<PostView | undefined>;
  selectPost: (id: number) => void;
  topCaptions: Accessor<CaptionView[] | undefined>;
  winningCaption: Accessor<CaptionView | undefined>;
  selectedCaption: Accessor<CaptionView | undefined>;
  selectCaption: (id: number) => void;
  selectedCategory: Accessor<number>;
  setSelectedCategory: Setter<number>;
  hero: Accessor<JediHero | undefined>;
  profile: Accessor<AuthorRef | undefined>;
}

/** The synthetic "no filter" row. Id 0 is unused by the real categories. */
const ALL_CATEGORIES: JediCategory = { id: 0, name: "All", icon: "menu" };

export function createJediFeed(): JediFeed {
  const [selectedCategory, setSelectedCategory] = createSignal(0);
  const [selectedPostId, setSelectedPostId] = createSignal<number | undefined>();
  const [selectedCaptionId, setSelectedCaptionId] = createSignal<number | undefined>();

  const [realCategories] = createResource(() => jediApi.categories.list());
  const [posts] = createResource(() => jediApi.posts.list());
  const [featured] = createResource(() => jediApi.posts.featured());

  const categories = (): JediCategory[] | undefined => {
    const list = realCategories();
    return list && [ALL_CATEGORIES, ...list];
  };

  // Filtering happens here so the Top Photos card stays presentational. Ranking
  // is inherited from `posts` — filter preserves order.
  const visiblePosts = (): PostView[] | undefined => {
    const all = posts();
    const category = categories()?.[selectedCategory()];
    if (!all || !category || category.id === ALL_CATEGORIES.id) return all;
    return all.filter((p) => p.categories.some((c) => c.id === category.id));
  };

  // The clicked post, but only while the filter still lists it; otherwise the
  // top-ranked visible post (`featured` covers load and empty-category states).
  const selectedPost = (): PostView | undefined => {
    const visible = visiblePosts();
    const id = selectedPostId();
    return visible?.find((p) => p.id === id) ?? visible?.[0] ?? featured();
  };
  const selectPost = (id: number): void => {
    setSelectedPostId(id);
  };

  const [topCaptions] = createResource(
    () => selectedPost()?.id,
    (postId) => jediApi.captions.listForPost(postId),
  );
  const winningCaption = () => topCaptions()?.[0];

  // Self-resets on a post change: the old id is absent from the new captions.
  const selectedCaption = (): CaptionView | undefined =>
    topCaptions()?.find((c) => c.id === selectedCaptionId()) ?? winningCaption();
  const selectCaption = (id: number): void => {
    setSelectedCaptionId(id);
  };

  const [hero] = createResource(() => jediApi.hero.get());
  const [profile] = createResource(() => jediApi.profile.get());

  return {
    categories,
    posts,
    visiblePosts,
    featured,
    selectedPost,
    selectPost,
    topCaptions,
    winningCaption,
    selectedCaption,
    selectCaption,
    selectedCategory,
    setSelectedCategory,
    hero,
    profile,
  };
}
