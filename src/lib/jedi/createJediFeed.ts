import { createResource, createSignal, type Accessor, type Setter } from "solid-js";
import { jediApi } from "~/lib/jedi/jedi-api";
import type { JediCategory, PostView, CaptionView } from "~/types/jedi";

/**
 * The Jedi feed's view-model: it owns the route's four data resources and the
 * derivations over them, exposing a small accessor interface. The route reads
 * these accessors and renders — no data orchestration in the markup — so the
 * derivations are exercisable at this seam without rendering the DOM, the same
 * way `jedi-api` is tested through its interface.
 *
 * `selectedCategory` is the selection state that issue #29's category filtering
 * will read from and filter behind; today it only tracks the sidebar highlight.
 */
export interface JediFeed {
  categories: Accessor<JediCategory[] | undefined>;
  posts: Accessor<PostView[] | undefined>;
  featured: Accessor<PostView | undefined>;
  topCaptions: Accessor<CaptionView[] | undefined>;
  winningCaption: Accessor<CaptionView | undefined>;
  selectedCategory: Accessor<number>;
  setSelectedCategory: Setter<number>;
}

export function createJediFeed(): JediFeed {
  const [selectedCategory, setSelectedCategory] = createSignal(0);

  const [categories] = createResource(() => jediApi.categories.list());
  const [posts] = createResource(() => jediApi.posts.list());
  const [featured] = createResource(() => jediApi.posts.featured());
  const [topCaptions] = createResource(
    () => featured()?.id,
    (postId) => jediApi.captions.listForPost(postId),
  );
  const winningCaption = () => topCaptions()?.[0];

  return {
    categories,
    posts,
    featured,
    topCaptions,
    winningCaption,
    selectedCategory,
    setSelectedCategory,
  };
}
