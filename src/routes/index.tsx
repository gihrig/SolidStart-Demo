import "@fontsource/lobster";
import { Title, Meta } from "@solidjs/meta";
import { Show, Switch, Match } from "solid-js";
import { useDisclosure } from "~/lib/useDisclosure";
import { createJediFeed } from "~/lib/jedi/createJediFeed";
import Hero from "~/components/Hero";
import FeaturedPost from "~/components/FeaturedPost";
import CategoriesCard from "~/components/CategoriesCard";
import TopPhotosCard from "~/components/TopPhotosCard";
import TopCaptionsCard from "~/components/TopCaptionsCard";
import Icon from "~/components/Icon";

export default function Home() {
  const {
    categories,
    visiblePosts,
    emptyCategoryLabel,
    selectedPost,
    selectPost,
    visibleCaptions,
    selectedCaption,
    selectCaption,
    selectedCategory,
    setSelectedCategory,
    hero,
  } = createJediFeed();

  const sidebar = useDisclosure({ id: "jedi-sidebar" });

  return (
    <>
      <Title>Little Jedi - Awesome Photos & Captions</Title>
      <Meta
        name="description"
        content="Share your favorite Photos from Flickr and add a great caption"
      />

      <Show when={hero()}>{(h) => <Hero {...h()} />}</Show>

      <div class="grid grid-cols-3 max-w-7xl mx-auto mt-6">
        {/* Mobile sidebar toggle */}
        <div class="md:hidden col-span-full mx-auto mb-6 relative z-10">
          <button
            type="button"
            aria-label="Toggle sidebar"
            {...sidebar.triggerProps}
            class="flex items-center font-bold text-(--theme-card-fg) bg-(--theme-card-bg) hover:text-(--theme-hover-fg) hover:bg-(--theme-hover-bg) rounded-lg p-3"
          >
            <span>Categories</span>
            <Icon
              name="expand-arrow"
              class={`w-4 h-4 ml-1.5 transition-transform ${sidebar.open() ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* Main article */}
        <main class="col-span-full md:col-span-2 mx-5pct md:mx-10pct order-2 md:order-1">
          <Switch fallback={<article class="card-style p-4">Loading…</article>}>
            <Match when={emptyCategoryLabel()}>
              {(label) => <article class="card-style p-4">No Posts in {label()}</article>}
            </Match>
            <Match when={selectedPost()}>
              {(post) => <FeaturedPost post={post()} caption={selectedCaption()} />}
            </Match>
          </Switch>
        </main>

        {/* Sidebar — grid-rows collapse: aside is nested grid inside parent grid-cols-3 */}
        <aside
          {...sidebar.panelProps}
          class={`col-span-full md:col-span-1 mx-5pct md:mr-20pct order-1 md:order-2 grid transition-[grid-template-rows,opacity] duration-300 ease-out md:opacity-100 md:grid-rows-[1fr] ${sidebar.open() ? "opacity-100 grid-rows-[1fr]" : "opacity-0 grid-rows-[0fr]"}`}
        >
          <div class="overflow-hidden min-h-0 md:overflow-visible">
            <CategoriesCard
              categories={categories}
              selectedCategory={selectedCategory}
              onSelect={setSelectedCategory}
            />
            <TopPhotosCard
              posts={visiblePosts}
              selectedPost={selectedPost}
              onSelect={selectPost}
              emptyLabel={emptyCategoryLabel}
            />
            <TopCaptionsCard
              captions={visibleCaptions}
              selectedCaption={selectedCaption}
              onSelect={selectCaption}
            />
          </div>
        </aside>
      </div>
    </>
  );
}
