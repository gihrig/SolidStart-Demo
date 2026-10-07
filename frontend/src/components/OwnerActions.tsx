import { Show } from "solid-js";
import type { AuthorRef } from "~/types/jedi";

export interface OwnerActionsProps {
  /** What the actions act on, in the button labels: "Post" or "caption". */
  noun: string;
  /** The author of the Post or the Caption; undefined when there is none yet. */
  author?: AuthorRef;
  /** Only a logged-in User sees the buttons; a visitor sees none. */
  loggedIn?: boolean;
  /** The logged-in User's id; undefined when logged out or still loading. */
  userId?: number;
}

/**
 * Edit and Delete (#123). A logged-in User always sees both; they are enabled
 * only for the Owner, and stay disabled until the viewer's id loads. This only
 * gates buttons; the back-end owns enforcement. Both stay placeholders until
 * their write paths land.
 */
export default function OwnerActions(props: OwnerActionsProps) {
  const isOwner = () => props.userId !== undefined && props.userId === props.author?.id;
  const label = (action: string) =>
    props.author ? `${action} ${props.noun} by ${props.author.name}` : `${action} ${props.noun}`;
  return (
    <Show when={props.loggedIn}>
      <button
        type="button"
        onClick={() => {}}
        disabled={!isOwner()}
        class="theme-button disabled:opacity-50"
        aria-label={label("Edit")}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => {}}
        disabled={!isOwner()}
        class="theme-button disabled:opacity-50"
        aria-label={label("Delete")}
      >
        Delete
      </button>
    </Show>
  );
}
