// How many leading characters of the name fit in the avatar circle (#119).
const AVATAR_INITIALS = 2;

export interface InitialsAvatarProps {
  /** The name whose first characters fill the circle. */
  name: string;
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
      class="flex items-center justify-center h-8 w-8 rounded-full bg-teal-200 text-gray-900 text-sm font-bold overflow-hidden"
    >
      {initials()}
    </span>
  );
}
