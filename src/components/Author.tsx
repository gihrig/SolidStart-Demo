import { Show } from "solid-js";
import { sanitizeUrl } from "~/lib/sanitizeUrl";

export interface AuthorProps {
  avatarSrc: string;
  name: string;
  href?: string;
  onClick?: (e: MouseEvent) => void;
}

export default function Author(props: AuthorProps) {
  const imgSrc = () => sanitizeUrl(props.avatarSrc);

  return (
    <Show
      when={props.href}
      fallback={
        <div class="flex items-center gap-1 mb-4">
          <img class="w-8 h-8 rounded-full" src={imgSrc()} alt={props.name} loading="lazy" />
          <span class="font-bold">{props.name}</span>
        </div>
      }
    >
      {(href) => (
        <a
          class="flex items-center gap-1 mb-4 hover:underline"
          href={sanitizeUrl(href())}
          onClick={props.onClick}
        >
          <img class="w-8 h-8 rounded-full" src={imgSrc()} alt={props.name} loading="lazy" />
          <span class="font-bold">{props.name}</span>
        </a>
      )}
    </Show>
  );
}
