import { For, type Accessor } from "solid-js";
import { useListbox } from "~/lib/useListbox";
import type { CaptionView } from "~/types/jedi";
import Card from "~/components/Card";

export interface TopCaptionsCardProps {
  /** The selected post's captions, ranked by likes (the seam re-keys these). */
  captions: Accessor<CaptionView[] | undefined>;
  /** Shown under the post in `<main>`; defaults to the winning caption. */
  selectedCaption: Accessor<CaptionView | undefined>;
  onSelect: (id: number) => void;
}

export default function TopCaptionsCard(props: TopCaptionsCardProps) {
  // Same index<->id mapping as TopPhotosCard: `useListbox` counts in indices,
  // the seam selects by id.
  const selectedIndex = () => {
    const id = props.selectedCaption()?.id;
    return props.captions()?.findIndex((c) => c.id === id) ?? -1;
  };

  const { listboxProps, getOptionProps, ringIndex } = useListbox({
    count: () => props.captions()?.length ?? 0,
    selectedIndex,
    onSelect: (index) => {
      const caption = props.captions()?.[index];
      if (caption) props.onSelect(caption.id);
    },
    label: "Top Captions",
    idPrefix: "caption",
  });

  return (
    <Card title="Top Captions">
      <ul class="space-y-1" {...listboxProps}>
        <For each={props.captions() ?? []}>
          {(c, index) => (
            <li
              {...getOptionProps(index())}
              aria-current={props.selectedCaption()?.id === c.id ? "true" : undefined}
              class="flex items-center cursor-pointer w-full p-2 rounded outline-none hover:bg-(--theme-hover-bg) transition-colors duration-150"
              classList={{
                "bg-(--theme-highlight)": props.selectedCaption()?.id === c.id,
                "ring-2": ringIndex() === index(),
                "ring-(--theme-accent)": ringIndex() === index(),
              }}
            >
              <img
                class="w-8 h-8 rounded-full object-cover mr-1"
                src={c.author.avatarUrl}
                alt=""
                loading="lazy"
              />
              <span class="font-bold text-sm mr-1">{c.author.name}</span>
              <span class="text-sm font-light text-(--theme-card-fg)">({c.likeCount} Likes)</span>
            </li>
          )}
        </For>
      </ul>
    </Card>
  );
}
