import "@fontsource/lobster";
import "./jedi.css";
import { Title, Meta } from "@solidjs/meta";
import { createSignal, For, Show } from "solid-js";
import { useIsMobile } from "~/lib/useIsMobile";
import { useListbox } from "~/lib/useListbox";
import { useDismiss } from "~/lib/useDismiss";
import { createJediFeed } from "~/lib/jedi/createJediFeed";
import Hero from "~/components/Hero";
import JediNav from "~/components/JediNav";
import Image from "~/components/Image";
import Author from "~/components/Author";
import Card from "~/components/Card";
import Icon from "~/components/Icon";

export default function Jedi() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = createSignal(false);

  const {
    categories,
    posts,
    selectedPost,
    selectPost,
    topCaptions,
    winningCaption,
    selectedCategory,
    setSelectedCategory,
    hero,
    profile,
  } = createJediFeed();

  const isMobile = useIsMobile();
  const { listboxProps, getOptionProps, focusedIndex } = useListbox({
    count: () => categories()?.length ?? 0,
    selectedIndex: selectedCategory,
    onSelect: setSelectedCategory,
    label: "Categories",
    idPrefix: "category",
  });
  const isLiked = () => false;
  useDismiss(() => setMobileSidebarOpen(false), mobileSidebarOpen);

  return (
    <>
      <Title>Little Jedi - Awesome Photos & Captions</Title>
      <Meta
        name="description"
        content="Share your favorite Photos from Flickr and add a great caption"
      />
      <JediNav profile={profile()} />

      <Show when={hero()}>{(h) => <Hero {...h()} />}</Show>

      <div class="grid grid-cols-3 max-w-7xl mx-auto mt-6">
        {/* Mobile sidebar toggle */}
        <div class="md:hidden col-span-full mx-auto mb-6 relative z-10">
          <button
            type="button"
            aria-label="Toggle sidebar"
            aria-expanded={mobileSidebarOpen()}
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen())}
            class="flex items-center font-bold text-(--theme-card-fg) bg-(--theme-card-bg) hover:text-(--theme-hover-fg) hover:bg-(--theme-hover-bg) rounded-lg p-3"
          >
            <span>Categories</span>
            <Icon
              name="expand-arrow"
              class={`w-4 h-4 ml-1.5 transition-transform ${mobileSidebarOpen() ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* Main article */}
        <main class="col-span-full md:col-span-2 mx-5pct md:mx-10pct order-2 md:order-1">
          <Show when={selectedPost()} fallback={<article class="card-style p-4">Loading…</article>}>
            {(post) => (
              <article class="card-style">
                {/* Title bar */}
                <div class="flex items-center justify-between px-4 h-14">
                  <h2 class="text-2xl font-bold w-1/2 truncate">{post().title}</h2>
                  <div class="text-sm text-(--theme-muted)">
                    flickr @{" "}
                    <a
                      href={post().photographerUrl}
                      class="hover:underline rounded"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {post().photographer}
                    </a>
                  </div>
                </div>
                {/* Image */}
                <Image
                  src={post().imageSrc}
                  alt={post().imageAlt}
                  href={post().sourceUrl}
                  loading="lazy"
                />
                {/* Body: author, caption, tags, actions */}
                <div class="p-4 pb-2">
                  <Author
                    avatarSrc={post().author.avatarUrl}
                    name={post().author.name}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      alert("Not implemented");
                    }}
                  />
                  <p class="text-5xl mb-10 px-4 font-hero">{winningCaption()?.text ?? ""}</p>
                  <div class="flex items-center gap-2 text-sm mb-5">
                    <For each={post().categories}>
                      {(c) => (
                        <button type="button" onClick={() => {}} class="theme-button">
                          {c.name}
                        </button>
                      )}
                    </For>
                  </div>
                  <div class="flex items-center justify-between text-sm px-2">
                    <a
                      class="font-bold hover:underline rounded"
                      href="#"
                      aria-label={`Open Comments page, ${post().commentCount} comments`}
                      onClick={(e) => {
                        e.preventDefault();
                        alert("Not implemented");
                      }}
                    >
                      Comments
                      <span class="font-light text-(--theme-card-fg) ml-2">
                        {post().commentCount}
                      </span>
                    </a>
                    <div class="flex items-center gap-4">
                      <div class="flex items-center gap-1">
                        <Icon name="fire-heart" class="w-5 -mt-1" />
                        <span class="font-light text-(--theme-card-fg) ml-2">
                          <span class="sr-only">Likes: </span>
                          {post().likeCount}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {}}
                        class="theme-button"
                        aria-pressed={isLiked()}
                        aria-label={`Like post by ${post().author.name}`}
                      >
                        Like
                      </button>
                      <button
                        type="button"
                        onClick={() => {}}
                        class="theme-button"
                        aria-label={`Edit Post by ${post().author.name}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {}}
                        class="theme-button"
                        aria-label={`Delete Post by ${post().author.name}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )}
          </Show>
        </main>

        {/* Sidebar — grid-rows collapse: aside is nested grid inside parent grid-cols-3 */}
        <aside
          inert={isMobile() && !mobileSidebarOpen()}
          class={`col-span-full md:col-span-1 mx-5pct md:mr-20pct order-1 md:order-2 grid transition-[grid-template-rows,opacity] duration-300 ease-out md:opacity-100 md:grid-rows-[1fr] ${mobileSidebarOpen() ? "opacity-100 grid-rows-[1fr]" : "opacity-0 grid-rows-[0fr]"}`}
        >
          <div class="overflow-hidden min-h-0 md:overflow-visible">
            <Card title="Categories">
              <ul class="space-y-1" {...listboxProps}>
                <For each={categories() ?? []}>
                  {(c, index) => (
                    <li
                      {...getOptionProps(index())}
                      classList={{
                        "bg-(--theme-highlight)": selectedCategory() === index(),
                        "ring-2": focusedIndex() === index(),
                        "ring-(--theme-accent)": focusedIndex() === index(),
                      }}
                      class="flex items-center cursor-pointer px-2 py-1 rounded outline-none"
                    >
                      <Icon name={c.icon} class="w-8 h-8 object-cover mr-2" />
                      <span class="font-bold text-sm">{c.name}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Card>
            <Card title="Top Photos">
              <ul class="space-y-1">
                <For each={posts() ?? []}>
                  {(p) => (
                    <li class="rounded-md">
                      <button
                        type="button"
                        onClick={() => selectPost(p.id)}
                        aria-current={selectedPost()?.id === p.id ? "true" : undefined}
                        classList={{ "bg-(--theme-highlight)": selectedPost()?.id === p.id }}
                        class="flex items-center w-full p-2 rounded hover:bg-(--theme-hover-bg) transition-colors duration-150"
                      >
                        <img
                          class="w-10 h-10 rounded-lg object-cover mr-3"
                          src={p.imageSrc}
                          alt={p.imageAlt}
                          loading="lazy"
                        />
                        <img
                          class="w-6 h-6 rounded-full object-cover mr-0.5"
                          src={p.author.avatarUrl}
                          alt=""
                          loading="lazy"
                        />
                        <span class="font-bold text-sm mr-1">{p.author.name}</span>
                        <span class="text-sm font-light text-(--theme-card-fg)">
                          ({p.likeCount} Likes)
                        </span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Card>
            <Card title="Top Captions">
              <ul class="space-y-1">
                <For each={topCaptions() ?? []}>
                  {(c) => (
                    <li class="rounded-md">
                      <button
                        type="button"
                        onClick={() => alert("Not implemented")}
                        class="flex items-center p-2 rounded hover:bg-(--theme-hover-bg) transition-colors duration-150"
                      >
                        <img
                          class="w-8 h-8 rounded-full object-cover mr-1"
                          src={c.author.avatarUrl}
                          alt=""
                          loading="lazy"
                        />
                        <span class="font-bold text-sm mr-1">{c.author.name}</span>
                        <span class="text-sm font-light text-(--theme-card-fg)">
                          ({c.likeCount} Likes)
                        </span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Card>
          </div>
        </aside>
      </div>
    </>
  );
}
