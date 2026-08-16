import { For, Show, type Accessor } from "solid-js";
import { useListbox } from "~/lib/useListbox";
import type { PostView } from "~/types/jedi";
import Card from "~/components/Card";

export interface TopPhotosCardProps {
  /** Already ranked, and filtered to the selected category by the seam (#33-b). */
  posts: Accessor<PostView[] | undefined>;
  selectedPost: Accessor<PostView | undefined>;
  onSelect: (id: number) => void;
  /** Set to the category name when its filter matches no posts; the card then
   *  shows a "No Posts in …" message in place of the list (mirrors `<main>`). */
  emptyLabel?: Accessor<string | undefined>;
}

export default function TopPhotosCard(props: TopPhotosCardProps) {
  const { listboxProps, getOptionProps } = useListbox({
    items: () => props.posts(),
    selectedKey: () => props.selectedPost()?.id,
    keyOf: (post) => post.id,
    onSelect: (post) => props.onSelect(post.id),
    label: "Top Photos",
    idPrefix: "photo",
  });

  return (
    <Card title="Top Photos">
      <Show
        when={!props.emptyLabel?.()}
        fallback={
          <p class="p-2 text-sm text-(--theme-card-fg)">No Posts in {props.emptyLabel?.()}</p>
        }
      >
        <ul class="space-y-1" {...listboxProps}>
          <For each={props.posts() ?? []}>
            {(p, index) => (
              <li
                class="flex items-center cursor-pointer w-full p-2 rounded outline-none hover:bg-(--theme-hover-bg) transition-colors duration-150"
                {...getOptionProps(index())}
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
      </Show>
    </Card>
  );
}
