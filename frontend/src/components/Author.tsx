import { Show } from "solid-js";
import type { SafeUrl } from "~/lib/sanitizeUrl";
import InitialsAvatar from "~/components/InitialsAvatar";

export interface AuthorProps {
  avatarSrc: SafeUrl;
  name: string;
  href?: SafeUrl;
  onClick?: (e: MouseEvent) => void;
}

export default function Author(props: AuthorProps) {
  // An author with no avatar gets the name's initials in a turquoise circle, the
  // same stand-in as the Nav avatar.
  const avatar = () => (
    <Show
      when={props.avatarSrc}
      fallback={<InitialsAvatar name={props.name} data-testid="author-initials" />}
    >
      {(src) => <img class="w-8 h-8 rounded-full" src={src()} alt={props.name} loading="lazy" />}
    </Show>
  );

  return (
    <Show
      when={props.href}
      fallback={
        <div class="flex items-center gap-1 mb-4">
          {avatar()}
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
          {avatar()}
          <span class="font-bold">{props.name}</span>
        </a>
      )}
    </Show>
  );
}
