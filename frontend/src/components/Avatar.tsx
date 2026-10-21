import { Show } from "solid-js";
import type { SafeUrl } from "~/lib/sanitizeUrl";
import InitialsAvatar, { type AvatarSize } from "~/components/InitialsAvatar";

// The image's diameter, per size; it matches the `InitialsAvatar` circle.
const IMAGE_CLASS: Record<AvatarSize, string> = {
  24: "w-6 h-6",
  32: "w-8 h-8",
};

export interface AvatarProps {
  /** The sanitized avatar image; the empty `SafeUrl`, or undefined, for none. */
  src: SafeUrl | undefined;
  /** The User's name: its initials stand in for a missing image. */
  name: string;
  /** The image's alt text. Pass `""` where the name shows next to it. */
  alt: string;
  /** The diameter in px; defaults to 32. */
  size?: AvatarSize;
  /** The test id of the initials stand-in. */
  "data-testid"?: string;
}

/**
 * A User's avatar: the image, else the name's initials in a turquoise circle
 * (`InitialsAvatar`). The one place that makes this choice (#125). A non-square
 * image is cropped to the circle (`object-cover`), not stretched.
 */
export default function Avatar(props: AvatarProps) {
  return (
    <Show
      when={props.src}
      fallback={
        <InitialsAvatar name={props.name} size={props.size} data-testid={props["data-testid"]} />
      }
    >
      {(src) => (
        <img
          class={`${IMAGE_CLASS[props.size ?? 32]} rounded-full object-cover`}
          src={src()}
          alt={props.alt}
          loading="lazy"
        />
      )}
    </Show>
  );
}
