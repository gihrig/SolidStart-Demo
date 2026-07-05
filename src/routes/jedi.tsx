import "@fontsource/lobster";
import "./jedi.css";
import { Title, Meta } from "@solidjs/meta";
import { createSignal, For } from "solid-js";
import { useIsMobile } from "~/lib/useIsMobile";
import { useListbox } from "~/lib/useListbox";
import { useDismiss } from "~/lib/useDismiss";
import Hero from "~/components/Hero";
import JediNav from "~/components/JediNav";
import Image from "~/components/Image";
import Author from "~/components/Author";
import Card from "~/components/Card";
import Icon, { type IconName } from "~/components/Icon";

const CATEGORIES = [
  { name: "Landscape", icon: "landscape" },
  { name: "People", icon: "portrait" },
  { name: "Animals", icon: "dog" },
  { name: "Abstract", icon: "collage" },
  { name: "Black & White", icon: "180-degrees" },
] as const satisfies { name: string; icon: IconName }[];

const TOP_PHOTOS = [
  {
    src: "https://live.staticflickr.com/65535/50618365686_36f887ab88_c.jpg",
    alt: "Little Jedi",
    avatar: "https://img.icons8.com/doodle/96/null/lisa-simpson.png",
    author: "Lisa",
    likes: 5,
  },
  {
    src: "https://live.staticflickr.com/7374/9311425598_46cfda9977_c.jpg",
    alt: "Brilliant tree",
    avatar: "https://img.icons8.com/doodle/96/null/homer-simpson.png",
    author: "Homer",
    likes: 4,
  },
];

const TOP_CAPTIONS = [
  { avatar: "https://img.icons8.com/doodle/96/null/lisa-simpson.png", author: "Lisa", likes: 8 },
  { avatar: "https://img.icons8.com/doodle/96/null/bart-simpson.png", author: "Bart", likes: 5 },
];

export default function Jedi() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = createSignal(false);
  const [selectedCategory, setSelectedCategory] = createSignal(0);
  const isMobile = useIsMobile();
  const { listboxProps, getOptionProps, focusedIndex } = useListbox({
    count: () => CATEGORIES.length,
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
      <JediNav />

      <Hero
        title="Awesome Photos & Captions"
        subtitle="Share your favorite Photos from Flickr and add a great caption"
        ctaText="Get Started"
        ctaHref="#"
        backgroundImage="https://live.staticflickr.com/65535/49909538937_3255dcf9e7_b.jpg"
      />

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
          <article class="card-style">
            {/* Title bar */}
            <div class="flex items-center justify-between px-4 h-14">
              <h2 class="text-2xl font-bold w-1/2 truncate">Little Jedi</h2>
              <div class="text-sm text-(--theme-muted)">
                flickr @{" "}
                <a
                  href="https://www.flickr.com/photos/felicefelines/"
                  class="hover:underline rounded"
                  target="_blank"
                  rel="noreferrer"
                >
                  Felicity Berkleef
                </a>
              </div>
            </div>
            {/* Image */}
            <Image
              src="https://live.staticflickr.com/65535/50618365686_36f887ab88_c.jpg"
              alt="Little Jedi cat"
              href="https://www.flickr.com/photos/felicefelines/50618365686/"
              loading="lazy"
            />
            {/* Body: author, caption, tags, actions */}
            <div class="p-4 pb-2">
              <Author
                avatarSrc="https://img.icons8.com/doodle/96/null/lisa-simpson.png"
                name="Lisa"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  alert("Not implemented");
                }}
              />
              <p class="text-5xl mb-10 px-4 font-hero">Jedi Kitty protects the street</p>
              <div class="flex items-center gap-2 text-sm mb-5">
                <button type="button" onClick={() => {}} class="theme-button">
                  Animals
                </button>
                <button type="button" onClick={() => {}} class="theme-button">
                  Cute
                </button>
              </div>
              <div class="flex items-center justify-between text-sm px-2">
                <a
                  class="font-bold hover:underline rounded"
                  href="#"
                  aria-label="Open Comments page, 3 comments"
                  onClick={(e) => {
                    e.preventDefault();
                    alert("Not implemented");
                  }}
                >
                  Comments
                  <span class="font-light text-(--theme-card-fg) ml-2">3</span>
                </a>
                <div class="flex items-center gap-4">
                  <div class="flex items-center gap-1">
                    <Icon name="fire-heart" class="w-5 -mt-1" />
                    <span class="font-light text-(--theme-card-fg) ml-2">
                      <span class="sr-only">Likes: </span>1
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {}}
                    class="theme-button"
                    aria-pressed={isLiked()}
                    aria-label="Like post by Lisa"
                  >
                    Like
                  </button>
                  <button
                    type="button"
                    onClick={() => {}}
                    class="theme-button"
                    aria-label="Edit Post by Lisa"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {}}
                    class="theme-button"
                    aria-label="Delete Post by Lisa"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </article>
        </main>

        {/* Sidebar — grid-rows collapse: aside is nested grid inside parent grid-cols-3 */}
        <aside
          inert={isMobile() && !mobileSidebarOpen()}
          class={`col-span-full md:col-span-1 mx-5pct md:mr-20pct order-1 md:order-2 grid transition-[grid-template-rows,opacity] duration-300 ease-out md:opacity-100 md:grid-rows-[1fr] ${mobileSidebarOpen() ? "opacity-100 grid-rows-[1fr]" : "opacity-0 grid-rows-[0fr]"}`}
        >
          <div class="overflow-hidden min-h-0 md:overflow-visible">
            <Card title="Categories">
              <ul class="space-y-1" {...listboxProps}>
                <For each={CATEGORIES}>
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
                <For each={TOP_PHOTOS}>
                  {(p) => (
                    <li class="rounded-md">
                      <button
                        type="button"
                        onClick={() => alert("Not implemented")}
                        class="flex items-center p-2 rounded hover:bg-(--theme-hover-bg) transition-colors duration-150"
                      >
                        <img
                          class="w-10 h-10 rounded-lg object-cover mr-3"
                          src={p.src}
                          alt={p.alt}
                          loading="lazy"
                        />
                        <img
                          class="w-6 h-6 rounded-full object-cover mr-0.5"
                          src={p.avatar}
                          alt=""
                          loading="lazy"
                        />
                        <span class="font-bold text-sm mr-1">{p.author}</span>
                        <span class="text-sm font-light text-(--theme-card-fg)">
                          ({p.likes} Likes)
                        </span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Card>
            <Card title="Top Captions">
              <ul class="space-y-1">
                <For each={TOP_CAPTIONS}>
                  {(c) => (
                    <li class="rounded-md">
                      <button
                        type="button"
                        onClick={() => alert("Not implemented")}
                        class="flex items-center p-2 rounded hover:bg-(--theme-hover-bg) transition-colors duration-150"
                      >
                        <img
                          class="w-8 h-8 rounded-full object-cover mr-1"
                          src={c.avatar}
                          alt=""
                          loading="lazy"
                        />
                        <span class="font-bold text-sm mr-1">{c.author}</span>
                        <span class="text-sm font-light text-(--theme-card-fg)">
                          ({c.likes} Likes)
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
