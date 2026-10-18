import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";
import type { DraftScope } from "~/lib/createDraftGuard";
import { createRpcAction } from "~/lib/createRpcAction";
import type { CommentThreadState } from "~/lib/jedi/createCommentThread";
import type { OwnerWrites } from "~/lib/jedi/createJediFeed";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { PostChanges, PostView, CaptionView, Like } from "~/types/jedi";
import Image from "~/components/Image";
import Author from "~/components/Author";
import CommentThread from "~/components/CommentThread";
import ConfirmDialog from "~/components/ConfirmDialog";
import PostDialog from "~/components/PostDialog";
import LikeControl from "~/components/LikeControl";
import OwnerActions from "~/components/OwnerActions";
import PostCaption from "~/components/PostCaption";

export interface FeaturedPostProps {
  post: PostView;
  /** The winning Caption shown on the post (a first-class entity, not bare
   *  text); undefined until the post's captions load or when it has none. */
  caption?: CaptionView;
  /** Whether the viewer is a logged-in User (#121, #123). A logged-in User sees
   *  every button on both lines; a visitor sees only the fire-heart and the count. */
  loggedIn?: boolean;
  /** The logged-in User's id (#123). Edit / Delete are enabled only for the
   *  Owner, and stay disabled until the id loads. This only gates buttons; the
   *  back-end owns enforcement. */
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
  /** This Post's Comment thread (#124), with the panel's open state. The
   *  Comments toggle opens it as an inline panel; without it, the toggle opens
   *  nothing. */
  postComments?: CommentThreadState;
  /** The shown Caption's Comment thread (#127), with the panel's open state.
   *  The Caption line's Comments toggle opens it as an inline panel. */
  captionComments?: CommentThreadState;
  /** The Owner's writes on this Post (#187): the Edit dialog, its save and
   *  the delete. */
  postOwner?: OwnerWrites<PostChanges>;
  /** The Owner's writes on the Caption shown (#187): the edit form in the
   *  Caption line, its save and the delete. */
  captionOwner?: OwnerWrites<string>;
  /** The scope of the Add Caption form's Draft (#214). */
  addCaptionScope?: DraftScope;
  /** Open the New Post dialog (#214). `opener` is the Add button, which takes
   *  focus after the close. */
  onAddPost?: (opener: HTMLElement) => void;
}

/** The notice of a locked Caption's Edit (#187, T7). */
const CAPTION_LOCKED_NOTICE = "A Caption with Likes or Comments cannot be edited.";

/** The delete questions (#187): each names what the delete removes. */
const POST_DELETE_QUESTION = "Delete this Post? Its Captions, Comments and Likes are deleted too.";
const CAPTION_DELETE_QUESTION = "Delete this Caption? Its Comments and Likes are deleted too.";

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

/** An Owner's delete as an RPC action (#187), so each reports its own error. */
const createDeleteAction = (
  remove: (id: number) => Promise<void> | undefined,
  fallbackError: string,
) =>
  createRpcAction(
    async (id: number) => {
      await remove(id);
      return true;
    },
    { fallbackError },
  );

export default function FeaturedPost(props: FeaturedPostProps) {
  // One action per Like target (#123), so each toggle reports its own error.
  const toggleLike = createLikeAction(() => props.onToggleLike?.());
  const toggleCaptionLike = createLikeAction(() => props.onToggleCaptionLike?.());
  // After the Owner's delete, focus moves to the Post title or the Caption
  // line (#187): each element stays while the next Post or Caption shows.
  let titleRef: HTMLHeadingElement | undefined;
  let captionLineRef: HTMLDivElement | undefined;
  const deletePost = createDeleteAction(
    (id) => props.postOwner?.remove(id),
    "Could not delete the Post",
  );
  const deleteCaption = createDeleteAction(
    (id) => props.captionOwner?.remove(id),
    "Could not delete the Caption",
  );
  const runDelete = async (
    action: typeof deletePost,
    id: number,
    focusAfter: () => HTMLElement | undefined,
  ) => {
    if (await action.run(id)) focusAfter()?.focus();
  };
  // The Owner's edits (#187). The view-model holds each open state; when an
  // edit closes, focus returns to its Edit button.
  let postEditRef: HTMLButtonElement | undefined;
  let captionEditRef: HTMLButtonElement | undefined;
  const postEditOpen = () => props.postOwner?.edit.open() ?? false;
  const captionEditOpen = () => props.captionOwner?.edit.open() ?? false;
  const closePostEdit = () => {
    props.postOwner?.edit.setOpen(false);
    postEditRef?.focus();
  };
  const closeCaptionEdit = () => {
    props.captionOwner?.edit.setOpen(false);
    captionEditRef?.focus();
  };
  // A Caption locks at its first Like or Comment, the Owner's own Like too. The
  // back-end stays the authority: a stale count gets its `Validation` error.
  const captionLocked = () => {
    const shown = props.caption;
    if (!shown) return false;
    return (props.captionLike?.likeCount ?? shown.likeCount) > 0 || shown.commentCount > 0;
  };
  const [lockedNotice, setLockedNotice] = createSignal(false);
  const editCaption = () => {
    if (captionLocked()) setLockedNotice(true);
    else props.captionOwner?.edit.setOpen(true);
  };
  const closeLockedNotice = () => {
    setLockedNotice(false);
    captionEditRef?.focus();
  };
  // A `posts` poke refetches the Post as a new object with the same id. The memo
  // keeps that from closing the Caption form.
  const postId = createMemo(() => props.post.id);
  // Add Caption (#121): the button sits on the categories line, the form in the
  // caption line. A new Post starts on its caption, not on a form left open.
  const [addingCaption, setAddingCaption] = createSignal(false);
  let addCaptionRef: HTMLButtonElement | undefined;
  createEffect(on(postId, () => setAddingCaption(false), { defer: true }));
  // Return focus to the button the form was opened from.
  const closeCaptionForm = () => {
    setAddingCaption(false);
    addCaptionRef?.focus();
  };
  // The Comments panel (#124). Its open state lives in the view-model, which
  // closes it when the selected Post changes.
  const commentsOpen = () => props.postComments?.open() ?? false;
  const commentsPanelId = () => `post-${postId()}-comments`;
  // The Caption Comments panel (#127), the same way. The view-model closes it
  // when the Caption shown changes.
  const captionCommentsOpen = () => props.captionComments?.open() ?? false;
  const captionCommentsPanelId = () => `post-${postId()}-caption-comments`;
  const captionCommentCount = () => props.caption?.commentCount ?? 0;
  // The author link is a placeholder until it lands on the feed seam.
  const notImplemented = (e: MouseEvent) => {
    e.preventDefault();
    alert("Not implemented");
  };

  return (
    <article class="card-style">
      {/* Title bar */}
      <div class="flex items-center justify-between px-4 h-14">
        <h2 ref={(el) => (titleRef = el)} tabindex="-1" class="text-2xl font-bold w-1/2 truncate">
          {props.post.title}
        </h2>
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
          ref={(el) => (captionLineRef = el)}
          editing={captionEditOpen()}
          editScope={props.captionOwner?.edit.draftScope}
          addScope={props.addCaptionScope}
          onSaveEdit={(id, text) => props.captionOwner?.save(id, text) ?? Promise.resolve()}
          onEditClose={closeCaptionEdit}
        />
        <div class="flex items-center gap-2 text-sm mb-10">
          <For each={props.post.categories}>
            {(c) => (
              <button type="button" onClick={() => {}} class="theme-button">
                {c.name}
              </button>
            )}
          </For>
          {/* The Caption actions (#123), for the Caption shown: the Comments
              toggle and its count (#127), fire-heart, count, Like, Add, Edit,
              Delete. A visitor sees the Comments toggle, the fire-heart and the
              count of a Caption that exists. A logged-in User sees every button;
              one that cannot act now is disabled. The toggle's accessible name
              starts "Caption comments", so it never reads as the Post's toggle.
              pr-2 matches the Post line's px-2. */}
          <Show when={props.loggedIn || props.caption}>
            <div class="flex items-center gap-4 ml-auto pr-2">
              <button
                type="button"
                class="font-bold hover:underline rounded disabled:opacity-50 disabled:no-underline"
                aria-label={`Caption comments, ${captionCommentCount()} comments`}
                aria-expanded={captionCommentsOpen()}
                aria-controls={captionCommentsPanelId()}
                disabled={!props.caption}
                onClick={() => props.captionComments?.setOpen(!captionCommentsOpen())}
              >
                Comments
                <span class="font-light text-(--theme-card-fg) ml-2">{captionCommentCount()}</span>
              </button>
              <LikeControl
                like={props.caption ? props.captionLike : undefined}
                fallbackCount={props.caption?.likeCount ?? 0}
                countLabel="Caption likes"
                label={
                  props.caption ? `Like caption by ${props.caption.author.name}` : "Like caption"
                }
                loggedIn={props.loggedIn}
                onToggle={() => void toggleCaptionLike.run(undefined)}
              />
              <Show when={props.loggedIn}>
                {/* Disabled while a form is open: on Add, on a Post with no
                    Caption, which shows the form directly, and while the
                    Caption edit is open (#187). */}
                <button
                  ref={(el) => (addCaptionRef = el)}
                  type="button"
                  onClick={() => setAddingCaption(true)}
                  disabled={!props.caption || addingCaption() || captionEditOpen()}
                  class="theme-button disabled:opacity-50"
                  aria-label="Add Caption"
                >
                  Add
                </button>
              </Show>
              <OwnerActions
                noun="caption"
                author={props.caption?.author}
                loggedIn={props.loggedIn}
                userId={props.userId}
                subjectId={props.caption?.id}
                deleteQuestion={CAPTION_DELETE_QUESTION}
                deleteDiscardsDraft={props.captionOwner?.removeDiscardsDraft}
                deleteDisabled={deleteCaption.pending() || captionEditOpen()}
                onDelete={(id) => void runDelete(deleteCaption, id, () => captionLineRef)}
                onEdit={editCaption}
                editDisabled={addingCaption() || captionEditOpen()}
                editRef={(el) => (captionEditRef = el)}
              />
              <Show when={lockedNotice()}>
                <ConfirmDialog
                  open
                  message={CAPTION_LOCKED_NOTICE}
                  confirmLabel="OK"
                  onConfirm={closeLockedNotice}
                />
              </Show>
            </div>
          </Show>
        </div>
        {/* The Caption Comments panel (#127): directly below the categories
            line, above the Post's panel. Both panels may be open at once. */}
        <section
          id={captionCommentsPanelId()}
          aria-label="Caption comments"
          hidden={!captionCommentsOpen()}
          class="mb-4 space-y-2 px-2 text-sm"
        >
          <Show when={captionCommentsOpen() && props.captionComments}>
            {(captionComments) => (
              <CommentThread
                id={captionCommentsPanelId()}
                thread={captionComments()}
                loggedIn={props.loggedIn}
                userId={props.userId}
              />
            )}
          </Show>
        </section>
        {/* The Comments panel (#124): below the categories line, above the
            Comments line, which stays at the bottom of the card. The element is
            always here, so the toggle's aria-controls resolves; the thread
            mounts only while open. */}
        <section
          id={commentsPanelId()}
          aria-label="Comments"
          hidden={!commentsOpen()}
          class="mb-4 space-y-2 px-2 text-sm"
        >
          <Show when={commentsOpen() && props.postComments}>
            {(postComments) => (
              <CommentThread
                id={commentsPanelId()}
                thread={postComments()}
                loggedIn={props.loggedIn}
                userId={props.userId}
              />
            )}
          </Show>
        </section>
        {/* One alert per action, so a Caption error never hides a Post error. */}
        <For
          each={[
            toggleCaptionLike.error(),
            deleteCaption.error(),
            toggleLike.error(),
            deletePost.error(),
          ].filter((e) => e !== null)}
        >
          {(error) => (
            <div role="alert" class="rounded bg-red-100 p-2 mb-2 text-red-700 text-sm">
              {error}
            </div>
          )}
        </For>
        <div class="flex items-center justify-between text-sm px-2">
          <button
            type="button"
            class="font-bold hover:underline rounded"
            aria-label={`Comments, ${props.post.commentCount} comments`}
            aria-expanded={commentsOpen()}
            aria-controls={commentsPanelId()}
            onClick={() => props.postComments?.setOpen(!commentsOpen())}
          >
            Comments
            <span class="font-light text-(--theme-card-fg) ml-2">{props.post.commentCount}</span>
          </button>
          <div class="flex items-center gap-4">
            {/* The visibility rule (#123): a visitor sees the fire-heart and the
                count. A logged-in User sees every button; Edit / Delete act for
                the Owner only. Add opens the one New Post dialog (#214). */}
            <LikeControl
              like={props.like}
              fallbackCount={props.post.likeCount}
              countLabel="Likes"
              label={`Like post by ${props.post.author.name}`}
              loggedIn={props.loggedIn}
              onToggle={() => void toggleLike.run(undefined)}
            />
            <Show when={props.loggedIn}>
              <button
                type="button"
                onClick={(e) => props.onAddPost?.(e.currentTarget)}
                class="theme-button"
                aria-label="Add Post"
              >
                Add
              </button>
            </Show>
            <OwnerActions
              noun="Post"
              author={props.post.author}
              loggedIn={props.loggedIn}
              userId={props.userId}
              subjectId={props.post.id}
              deleteQuestion={POST_DELETE_QUESTION}
              deleteDiscardsDraft={props.postOwner?.removeDiscardsDraft}
              deleteDisabled={deletePost.pending()}
              onDelete={(id) => void runDelete(deletePost, id, () => titleRef)}
              onEdit={() => props.postOwner?.edit.setOpen(true)}
              editRef={(el) => (postEditRef = el)}
            />
            {/* The Post edit (#187), keyed on the Post id: an edit never writes
                to another Post. */}
            <Show when={postEditOpen() && props.post.id} keyed>
              {(id) => (
                <PostDialog
                  post={props.post}
                  draftScope={props.postOwner?.edit.draftScope}
                  onSave={(changes) => props.postOwner?.save(id, changes) ?? Promise.resolve()}
                  onClose={closePostEdit}
                />
              )}
            </Show>
          </div>
        </div>
      </div>
    </article>
  );
}
