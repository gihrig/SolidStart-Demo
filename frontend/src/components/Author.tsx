import { Show } from "solid-js";
import type { SafeUrl } from "~/lib/sanitizeUrl";

export interface AuthorProps {
  avatarSrc: SafeUrl;
  name: string;
  href?: SafeUrl;
  onClick?: (e: MouseEvent) => void;
}

export default function Author(props: AuthorProps) {
  return (
    <Show
      when={props.href}
      fallback={
        <div class="flex items-center gap-1 mb-4">
          <img class="w-8 h-8 rounded-full" src={props.avatarSrc} alt={props.name} loading="lazy" />
          <span class="font-bold">{props.name}</span>
        </div>
      }
    >
      {(href) => (
        <a
          class="flex items-center gap-1 mb-4 hover:underline"
          href={href()}
          onClick={props.onClick}
        >
          <img class="w-8 h-8 rounded-full" src={props.avatarSrc} alt={props.name} loading="lazy" />
          <span class="font-bold">{props.name}</span>
        </a>
      )}
    </Show>
  );
}
