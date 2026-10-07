import { Show } from "solid-js";
import type { Like } from "~/types/jedi";
import Icon from "~/components/Icon";

export interface LikeControlProps {
  /** The viewer's like state (#122, #123). Undefined for a visitor or while it
   *  loads; the count then comes from `fallbackCount`. */
  like?: Like;
  /** The count from the public view (the Post's or the Caption's). */
  fallbackCount: number;
  /** The screen-reader label of the count, e.g. "Likes" or "Caption likes". */
  countLabel: string;
  /** The Like button's accessible name, e.g. "Like post by Lisa". */
  label: string;
  /** Only a logged-in User sees the Like button (#123). */
  loggedIn?: boolean;
  /** Like or unlike: the opposite of `like.liked`. */
  onToggle: () => void;
}

/**
 * One Like target's fire-heart, live count, and Like button (#123): the Post
 * line and the Caption line each render one. A visitor sees only the fire-heart
 * and the count. For a logged-in User, Like stays disabled until the like state
 * loads; it stays enabled while a toggle runs, so a fast click counts (#122).
 */
export default function LikeControl(props: LikeControlProps) {
  return (
    <>
      <div class="flex items-center gap-1">
        <Icon name="fire-heart" class="w-5 h-5 -mt-1" />
        <span class="font-light text-(--theme-card-fg) ml-2">
          <span class="sr-only">{props.countLabel}: </span>
          {props.like?.likeCount ?? props.fallbackCount}
        </span>
      </div>
      <Show when={props.loggedIn}>
        <button
          type="button"
          onClick={() => props.onToggle()}
          disabled={!props.like}
          class="theme-button disabled:opacity-50"
          aria-pressed={props.like?.liked ?? false}
          aria-label={props.label}
        >
          Like
        </button>
      </Show>
    </>
  );
}
