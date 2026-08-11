import { For, type Accessor } from "solid-js";
import { useListbox } from "~/lib/useListbox";
import type { JediCategory } from "~/types/jedi";
import Card from "~/components/Card";
import Icon from "~/components/Icon";

export interface CategoriesCardProps {
  categories: Accessor<JediCategory[] | undefined>;
  /** Index into `categories()` — the seam filters Top Photos behind it. */
  selectedCategory: Accessor<number>;
  onSelect: (index: number) => void;
}

export default function CategoriesCard(props: CategoriesCardProps) {
  const { listboxProps, getOptionProps } = useListbox({
    items: () => props.categories(),
    selectedKey: () => props.selectedCategory(),
    keyOf: (_category, index) => index,
    onSelect: (_category, index) => props.onSelect(index),
    label: "Categories",
    idPrefix: "category",
  });

  return (
    <Card title="Categories">
      <ul class="space-y-1" {...listboxProps}>
        <For each={props.categories() ?? []}>
          {(c, index) => (
            <li
              class="flex items-center cursor-pointer px-2 py-1 rounded outline-none"
              {...getOptionProps(index())}
            >
              <Icon name={c.icon} class="w-8 h-8 object-cover mr-2" />
              <span class="font-bold text-sm">{c.name}</span>
            </li>
          )}
        </For>
      </ul>
    </Card>
  );
}
