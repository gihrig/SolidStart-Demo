import { createEffect, createSignal, For, on, Show } from "solid-js";
import { createRpcAction } from "~/lib/createRpcAction";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { PostView, CaptionView, Like } from "~/types/jedi";
import Image from "~/components/Image";
import Author from "~/components/Author";
import LikeControl from "~/components/LikeControl";
import OwnerActions from "~/components/OwnerActions";
import PostCaption from "~/components/PostCaption";

export interface FeaturedPostProps {
  post: PostView;
  /** The winning Caption shown on the post (a first-class entity, not bare
   *  text); undefined until the post's captions load or when it has none. */
  caption?: CaptionView;
  /** Whether the viewer is a logged-in User (#121, #123). Only a logged-in User
   *  sees Like and Add; a visitor sees only the fire-heart and the count. */
  loggedIn?: boolean;
  /** The logged-in User's id (#123). Edit / Delete show only to the Owner, and
   *  stay hidden until the id loads. This only hides buttons; the back-end owns
   *  enforcement. */
  userId?: number;
  /** False while the post's captions load, so the caption form never flashes. */
  captionsLoaded?: boolean;
  /** The viewer's like state of this Post (#122). Undefined for an anonymous
   *  visitor or while it loads; the Like button is then disabled and the count
   *  comes from the Post. */
  like?: Like;
  /** Like or unlike this Post; the opposite of `like.liked`. */
  onToggleLike?: () => Promise<void>;
  /** The viewer's like state of the Caption shown (#123), as `like` is for the
   *  Post. Undefined for an anonymous visitor or while it loads. */
  captionLike?: Like;
  /** Like or unlike the Caption shown; the opposite of `captionLike.liked`. */
  onToggleCaptionLike?: () => Promise<void>;
}

/** A Like toggle as an RPC action. Only the error is used: the Like shows at
 *  once, so the button stays enabled while a toggle runs, and a fast click
 *  counts (#122). */
const createLikeAction = (toggle: () => Promise<void> | undefined) =>
  createRpcAction(
    async () => {
      await toggle();
      return true;
    },
    { fallbackError: "Could not update the Like" },
  );

export default function FeaturedPost(props: FeaturedPostProps) {
  // One action per Like target (#123), so each toggle reports its own error.
  const toggleLike = createLikeAction(() => props.onToggleLike?.());
  const toggleCaptionLike = createLikeAction(() => props.onToggleCaptionLike?.());
  // Add Caption (#121): the button sits on the categories line, the form in the
  // caption line. A new Post starts on its caption, not on a form left open.
  const [addingCaption, setAddingCaption] = createSignal(false);
  let addCaptionRef: HTMLButtonElement | undefined;
  createEffect(
    on(
      () => props.post.id,
      () => setAddingCaption(false),
      { defer: true },
    ),
  );
  // Return focus to the button the form was opened from.
  const closeCaptionForm = () => {
    setAddingCaption(false);
    addCaptionRef?.focus();
  };
  // Comment/edit/delete are placeholders until they land on the feed seam.
  const notImplemented = (e: MouseEvent) => {
    e.preventDefault();
    alert("Not implemented");
  };

  return (
    <article class="card-style">
      {/* Title bar */}
      <div class="flex items-center justify-between px-4 h-14">
        <h2 class="text-2xl font-bold w-1/2 truncate">{props.post.title}</h2>
        <div class="text-sm text-(--theme-muted)">
          flickr @{" "}
          <a
            href={props.post.photographerUrl}
            class="hover:underline rounded"
            target="_blank"
            rel="noreferrer"
          >
            {props.post.photographer}
          </a>
        </div>
      </div>
      {/* Image */}
      <Image
        src={props.post.imageSrc}
        alt={props.post.imageAlt}
        href={props.post.sourceUrl}
        loading="lazy"
      />
      {/* Body: author, caption, tags, actions. The Comments line sits two line
          heights (40px) below the categories and above the card's bottom edge:
          pb-6 here plus the card's own pb-4. */}
      <div class="p-4 pb-6">
        <Author
          avatarSrc={props.post.author.avatarUrl}
          name={props.post.author.name}
          href={trustedUrl("#")}
          onClick={notImplemented}
        />
        <PostCaption
          postId={props.post.id}
          caption={props.caption}
          captionsLoaded={props.captionsLoaded ?? false}
          canAdd={props.loggedIn ?? false}
          adding={addingCaption()}
          onClose={closeCaptionForm}
        />
        <div class="flex items-center gap-2 text-sm mb-10">
          <For each={props.post.categories}>
            {(c) => (
              <button type="button" onClick={() => {}} class="theme-button">
                {c.name}
              </button>
            )}
          </For>
          {/* The Caption actions (#123), for the Caption shown: fire-heart, count,
              Like, Add, Edit, Delete. A Post with no Caption shows the form. */}
          <Show when={props.caption}>
            {(c) => (
              <div class="flex items-center gap-4 ml-auto">
                <LikeControl
                  like={props.captionLike}
                  fallbackCount={c().likeCount}
                  countLabel="Caption likes"
                  label={`Like caption by ${c().author.name}`}
                  loggedIn={props.loggedIn}
                  onToggle={() => void toggleCaptionLike.run(undefined)}
                />
                <Show when={props.loggedIn && !addingCaption()}>
                  <button
                    ref={(el) => (addCaptionRef = el)}
                    type="button"
                    onClick={() => setAddingCaption(true)}
                    class="theme-button"
                    aria-label="Add Caption"
                  >
                    Add
                  </button>
                </Show>
                <OwnerActions noun="caption" author={c().author} userId={props.userId} />
              </div>
            )}
          </Show>
        </div>
        {/* One alert per toggle, so a Caption error never hides a Post error. */}
        <For each={[toggleCaptionLike.error(), toggleLike.error()].filter((e) => e !== null)}>
          {(error) => (
            <div role="alert" class="rounded bg-red-100 p-2 mb-2 text-red-700 text-sm">
              {error}
            </div>
          )}
        </For>
        <div class="flex items-center justify-between text-sm px-2">
          <a
            class="font-bold hover:underline rounded"
            href="#"
            aria-label={`Open Comments page, ${props.post.commentCount} comments`}
            onClick={notImplemented}
          >
            Comments
            <span class="font-light text-(--theme-card-fg) ml-2">{props.post.commentCount}</span>
          </a>
          <div class="flex items-center gap-4">
            {/* The visibility rule (#123): Like for a logged-in User, Edit /
                Delete for the Owner. */}
            <LikeControl
              like={props.like}
              fallbackCount={props.post.likeCount}
              countLabel="Likes"
              label={`Like post by ${props.post.author.name}`}
              loggedIn={props.loggedIn}
              onToggle={() => void toggleLike.run(undefined)}
            />
            <OwnerActions noun="Post" author={props.post.author} userId={props.userId} />
          </div>
        </div>
      </div>
    </article>
  );
}
