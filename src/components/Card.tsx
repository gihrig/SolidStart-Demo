import { Show, type ParentProps } from "solid-js";

export interface CardProps extends ParentProps {
  title?: string;
  class?: string;
}

export default function Card(props: CardProps) {
  return (
    <section class={props.class ? `card-style ${props.class}` : "card-style"}>
      <Show when={props.title}>
        <h2 class="text-2xl font-bold px-4 pt-4 pb-2">{props.title}</h2>
      </Show>
      <div class="p-4 pt-0">{props.children}</div>
    </section>
  );
}
