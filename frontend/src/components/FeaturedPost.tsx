import { createEffect, createSignal, For, on, Show } from "solid-js";
import { createRpcAction } from "~/lib/createRpcAction";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { PostView, CaptionView, Like } from "~/types/jedi";
import Image from "~/components/Image";
import Author from "~/components/Author";
import Icon from "~/components/Icon";
import PostCaption from "~/components/PostCaption";

export interface FeaturedPostProps {
  post: PostView;
  /** The winning Caption shown on the post (a first-class entity, not bare
   *  text); undefined until the post's captions load or when it has none. */
  caption?: CaptionView;
  /** Whether the viewer may add a Caption (a logged-in User, #121). */
  canAddCaption?: boolean;
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

export default function FeaturedPost(props: FeaturedPostProps) {
  // The live count: the viewer's like state once it loads, else the Post's.
  const likeCount = () => props.like?.likeCount ?? props.post.likeCount;
  // Only the error is used: the Like shows at once, so the button stays enabled
  // while a toggle runs, and a fast click counts (#122).
  const toggleLike = createRpcAction(
    async () => {
      await props.onToggleLike?.();
      return true;
    },
    { fallbackError: "Could not update the Like" },
  );
  // The Caption's live count and toggle (#123), as for the Post.
  const captionLikeCount = (caption: CaptionView) =>
    props.captionLike?.likeCount ?? caption.likeCount;
  const toggleCaptionLike = createRpcAction(
    async () => {
      await props.onToggleCaptionLike?.();
      return true;
    },
    { fallbackError: "Could not update the Like" },
  );
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
          canAdd={props.canAddCaption ?? false}
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
                <div class="flex items-center gap-1">
                  <Icon name="fire-heart" class="w-5 h-5 -mt-1" />
                  <span class="font-light text-(--theme-card-fg) ml-2">
                    <span class="sr-only">Caption likes: </span>
                    {captionLikeCount(c())}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleCaptionLike.run(undefined)}
                  disabled={!props.captionLike}
                  class="theme-button disabled:opacity-50"
                  aria-pressed={props.captionLike?.liked ?? false}
                  aria-label={`Like caption by ${c().author.name}`}
                >
                  Like
                </button>
                <Show when={props.canAddCaption && !addingCaption()}>
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
                <button
                  type="button"
                  onClick={() => {}}
                  class="theme-button"
                  aria-label={`Edit caption by ${c().author.name}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {}}
                  class="theme-button"
                  aria-label={`Delete caption by ${c().author.name}`}
                >
                  Delete
                </button>
              </div>
            )}
          </Show>
        </div>
        <Show when={toggleCaptionLike.error() ?? toggleLike.error()}>
          {(error) => (
            <div role="alert" class="rounded bg-red-100 p-2 mb-2 text-red-700 text-sm">
              {error()}
            </div>
          )}
        </Show>
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
            <div class="flex items-center gap-1">
              <Icon name="fire-heart" class="w-5 h-5 -mt-1" />
              <span class="font-light text-(--theme-card-fg) ml-2">
                <span class="sr-only">Likes: </span>
                {likeCount()}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void toggleLike.run(undefined)}
              disabled={!props.like}
              class="theme-button disabled:opacity-50"
              aria-pressed={props.like?.liked ?? false}
              aria-label={`Like post by ${props.post.author.name}`}
            >
              Like
            </button>
            <button
              type="button"
              onClick={() => {}}
              class="theme-button"
              aria-label={`Edit Post by ${props.post.author.name}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {}}
              class="theme-button"
              aria-label={`Delete Post by ${props.post.author.name}`}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
