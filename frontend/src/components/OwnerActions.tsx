import { Show } from "solid-js";
import type { AuthorRef } from "~/types/jedi";

export interface OwnerActionsProps {
  /** What the actions act on, in the button labels: "Post" or "caption". */
  noun: string;
  /** The author of the Post or the Caption. */
  author: AuthorRef;
  /** The logged-in User's id; undefined when logged out or still loading. */
  userId?: number;
}

/**
 * Edit and Delete for the Owner only (#123): they show when the viewer wrote the
 * Post or the Caption, and stay hidden until the viewer's id loads. This only
 * hides buttons; the back-end owns enforcement. Both stay placeholders until
 * their write paths land.
 */
export default function OwnerActions(props: OwnerActionsProps) {
  const isOwner = () => props.userId !== undefined && props.userId === props.author.id;
  return (
    <Show when={isOwner()}>
      <button
        type="button"
        onClick={() => {}}
        class="theme-button"
        aria-label={`Edit ${props.noun} by ${props.author.name}`}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => {}}
        class="theme-button"
        aria-label={`Delete ${props.noun} by ${props.author.name}`}
      >
        Delete
      </button>
    </Show>
  );
}
