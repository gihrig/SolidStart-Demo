import { Show } from "solid-js";
import type { SafeUrl } from "~/lib/sanitizeUrl";
import InitialsAvatar from "~/components/InitialsAvatar";

export interface AvatarProps {
  /** The sanitized avatar image; the empty `SafeUrl` for none. */
  src: SafeUrl;
  /** The User's name: its initials stand in for a missing image. */
  name: string;
  /** The image's alt text. Pass `""` where the name shows next to it. */
  alt: string;
  /** The test id of the initials stand-in. */
  "data-testid"?: string;
}

/**
 * A User's avatar: the image, else the name's initials in a turquoise circle
 * (`InitialsAvatar`). The one place that makes this choice (#125).
 */
export default function Avatar(props: AvatarProps) {
  return (
    <Show
      when={props.src}
      fallback={<InitialsAvatar name={props.name} data-testid={props["data-testid"]} />}
    >
      {(src) => <img class="w-8 h-8 rounded-full" src={src()} alt={props.alt} loading="lazy" />}
    </Show>
  );
}
