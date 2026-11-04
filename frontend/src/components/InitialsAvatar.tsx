// How many leading characters of the name fit in the avatar circle (#119).
const AVATAR_INITIALS = 2;

/** An avatar's diameter in px: 32 (the default) or 24 (#202). */
export type AvatarSize = 24 | 32;

/** The diameter an avatar takes when no size is given. */
export const DEFAULT_AVATAR_SIZE: AvatarSize = 32;

// The circle and its text, per size: the initials scale with the circle.
const CIRCLE_CLASS: Record<AvatarSize, string> = {
  24: "h-6 w-6 text-xs",
  32: "h-8 w-8 text-sm",
};

export interface InitialsAvatarProps {
  /** The name whose first characters fill the circle. */
  name: string;
  /** The circle's diameter in px; defaults to `DEFAULT_AVATAR_SIZE`. */
  size?: AvatarSize;
  "data-testid"?: string;
}

/**
 * The avatar stand-in for a User with no avatar image: the name's first two
 * characters, capitalized, in a turquoise circle. `Array.from` splits by code
 * point, so an emoji is never cut in half. Hidden from assistive tech — the name
 * itself is shown beside it.
 */
export default function InitialsAvatar(props: InitialsAvatarProps) {
  const initials = () => Array.from(props.name).slice(0, AVATAR_INITIALS).join("").toUpperCase();

  return (
    <span
      data-testid={props["data-testid"]}
      aria-hidden="true"
      class={`flex shrink-0 items-center justify-center ${CIRCLE_CLASS[props.size ?? DEFAULT_AVATAR_SIZE]} rounded-full bg-teal-200 text-gray-900 font-bold overflow-hidden`}
    >
      {initials()}
    </span>
  );
}
