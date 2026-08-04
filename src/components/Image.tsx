import { Show } from "solid-js";
import type { SafeUrl } from "~/lib/sanitizeUrl";

export interface ImageProps {
  src: SafeUrl;
  alt: string;
  href?: SafeUrl;
  class?: string;
  loading?: "lazy" | "eager";
}

export default function Image(props: ImageProps) {
  return (
    <figure class={props.class}>
      <Show
        when={props.href}
        fallback={
          <img class="w-full bg-gray-700" src={props.src} alt={props.alt} loading={props.loading} />
        }
      >
        {(href) => (
          <a href={href()}>
            <img
              class="w-full bg-gray-700"
              src={props.src}
              alt={props.alt}
              loading={props.loading}
            />
          </a>
        )}
      </Show>
    </figure>
  );
}
