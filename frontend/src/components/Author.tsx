import { Show } from "solid-js";
import type { SafeUrl } from "~/lib/sanitizeUrl";
import Avatar from "~/components/Avatar";

export interface AuthorProps {
  avatarSrc: SafeUrl;
  name: string;
  href?: SafeUrl;
  onClick?: (e: MouseEvent) => void;
}

export default function Author(props: AuthorProps) {
  const avatar = () => (
    <Avatar
      src={props.avatarSrc}
      name={props.name}
      alt={props.name}
      data-testid="author-initials"
    />
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
