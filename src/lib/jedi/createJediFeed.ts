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
 * `selectedCategory` is the selection state that issue #33's category filtering
 * will read from and filter behind; today it only tracks the sidebar highlight.
 *
 * `selectedPost` is the post shown in the main article (#29): it defaults to the
 * `featured` (top-ranked) post and follows `selectPost(id)` when a Top Photo is
 * clicked. `topCaptions` re-keys off it, so the caption/winningCaption and the
 * rest of the article's metadata track the selection.
 *
 * `hero` (the header banner content) and `profile` (the nav avatar's current
 * user) are the externalized header/hero data (#32): the route renders the Hero
 * from `hero` and hands `profile` to `<JediNav />`, so neither is hard-coded in
 * the markup.
 */
export interface JediFeed {
  categories: Accessor<JediCategory[] | undefined>;
  posts: Accessor<PostView[] | undefined>;
  featured: Accessor<PostView | undefined>;
  selectedPost: Accessor<PostView | undefined>;
  selectPost: (id: number) => void;
  topCaptions: Accessor<CaptionView[] | undefined>;
  winningCaption: Accessor<CaptionView | undefined>;
  selectedCategory: Accessor<number>;
  setSelectedCategory: Setter<number>;
  hero: Accessor<JediHero | undefined>;
  profile: Accessor<AuthorRef | undefined>;
}

export function createJediFeed(): JediFeed {
  const [selectedCategory, setSelectedCategory] = createSignal(0);
  const [selectedPostId, setSelectedPostId] = createSignal<number | undefined>();

  const [categories] = createResource(() => jediApi.categories.list());
  const [posts] = createResource(() => jediApi.posts.list());
  const [featured] = createResource(() => jediApi.posts.featured());

  // The clicked post from the loaded list, falling back to the featured default.
  const selectedPost = (): PostView | undefined => {
    const id = selectedPostId();
    return posts()?.find((p) => p.id === id) ?? featured();
  };
  const selectPost = (id: number): void => {
    setSelectedPostId(id);
  };

  const [topCaptions] = createResource(
    () => selectedPost()?.id,
    (postId) => jediApi.captions.listForPost(postId),
  );
  const winningCaption = () => topCaptions()?.[0];

  const [hero] = createResource(() => jediApi.hero.get());
  const [profile] = createResource(() => jediApi.profile.get());

  return {
    categories,
    posts,
    featured,
    selectedPost,
    selectPost,
    topCaptions,
    winningCaption,
    selectedCategory,
    setSelectedCategory,
    hero,
    profile,
  };
}
