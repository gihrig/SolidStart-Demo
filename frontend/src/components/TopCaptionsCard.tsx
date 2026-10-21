import { For, type Accessor } from "solid-js";
import { useListbox } from "~/lib/useListbox";
import type { CaptionView } from "~/types/jedi";
import Avatar from "~/components/Avatar";
import Card from "~/components/Card";

export interface TopCaptionsCardProps {
  /** The selected post's captions, ranked by likes (the seam re-keys these). */
  captions: Accessor<CaptionView[] | undefined>;
  /** Shown under the post in `<main>`; defaults to the winning caption. */
  selectedCaption: Accessor<CaptionView | undefined>;
  onSelect: (id: number) => void;
}

export default function TopCaptionsCard(props: TopCaptionsCardProps) {
  const { listboxProps, getOptionProps } = useListbox({
    items: () => props.captions(),
    selectedKey: () => props.selectedCaption()?.id,
    keyOf: (caption) => caption.id,
    onSelect: (caption) => props.onSelect(caption.id),
    label: "Top Captions",
    idPrefix: "caption",
  });

  return (
    <Card title="Top Captions">
      <ul class="space-y-1" {...listboxProps}>
        <For each={props.captions() ?? []}>
          {(c, index) => (
            <li
              class="flex items-center cursor-pointer w-full p-2 rounded outline-none hover:bg-(--theme-hover-bg) transition-colors duration-150"
              {...getOptionProps(index())}
            >
              <div class="shrink-0 mr-1">
                <Avatar
                  src={c.author.avatarUrl}
                  name={c.author.name}
                  alt=""
                  data-testid="caption-author-initials"
                />
              </div>
              <span class="font-bold text-sm mr-1">{c.author.name}</span>
              <span class="text-sm font-light text-(--theme-card-fg)">({c.likeCount} Likes)</span>
            </li>
          )}
        </For>
      </ul>
    </Card>
  );
}
