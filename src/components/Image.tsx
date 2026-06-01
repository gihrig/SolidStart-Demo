import { Show } from "solid-js";
import { sanitizeUrl } from "~/lib/sanitizeUrl";

export interface ImageProps {
  src: string;
  alt: string;
  href?: string;
  class?: string;
  loading?: "lazy" | "eager";
}

export default function Image(props: ImageProps) {
  const imgSrc = () => sanitizeUrl(props.src);

  return (
    <figure class={props.class}>
      <Show
        when={props.href}
        fallback={
          <img class="w-full bg-gray-700" src={imgSrc()} alt={props.alt} loading={props.loading} />
        }
      >
        {(href) => (
          <a href={sanitizeUrl(href())}>
            <img
              class="w-full bg-gray-700"
              src={imgSrc()}
              alt={props.alt}
              loading={props.loading}
            />
          </a>
        )}
      </Show>
    </figure>
  );
}
