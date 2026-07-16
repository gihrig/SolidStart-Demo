import { For, type Accessor } from "solid-js";
import { useListbox } from "~/lib/useListbox";
import type { PostView } from "~/types/jedi";
import Card from "~/components/Card";

export interface TopPhotosCardProps {
  /** Already ranked, and filtered to the selected category by the seam (#33-b). */
  posts: Accessor<PostView[] | undefined>;
  selectedPost: Accessor<PostView | undefined>;
  onSelect: (id: number) => void;
}

export default function TopPhotosCard(props: TopPhotosCardProps) {
  // `useListbox` works in list indices; the seam selects by id, so map at the edge.
  const selectedIndex = () => {
    const id = props.selectedPost()?.id;
    return props.posts()?.findIndex((p) => p.id === id) ?? -1;
  };

  const { listboxProps, getOptionProps, focusedIndex } = useListbox({
    count: () => props.posts()?.length ?? 0,
    selectedIndex,
    onSelect: (index) => {
      const post = props.posts()?.[index];
      if (post) props.onSelect(post.id);
    },
    label: "Top Photos",
    idPrefix: "photo",
  });

  return (
    <Card title="Top Photos">
      <ul class="space-y-1" {...listboxProps}>
        <For each={props.posts() ?? []}>
          {(p, index) => (
            <li
              {...getOptionProps(index())}
              aria-current={props.selectedPost()?.id === p.id ? "true" : undefined}
              classList={{
                "bg-(--theme-highlight)": props.selectedPost()?.id === p.id,
                "ring-2": focusedIndex() === index(),
                "ring-(--theme-accent)": focusedIndex() === index(),
              }}
              class="flex items-center cursor-pointer w-full p-2 rounded outline-none hover:bg-(--theme-hover-bg) transition-colors duration-150"
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
              <span class="text-sm font-light text-(--theme-card-fg)">({p.likeCount} Likes)</span>
            </li>
          )}
        </For>
      </ul>
    </Card>
  );
}
