import { createEffect, createMemo, createSignal, For, on, Show, type JSX } from "solid-js";
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
import Icon from "~/components/Icon";

export interface FeaturedPostProps {
  post: PostView;
  /** The winning Caption shown on the post (a first-class entity, not bare
   *  text); undefined until the post's captions load or when it has none. */
  caption?: CaptionView;
  /** Whether the viewer is a logged-in User (#121, #123). A logged-in User sees
   *  every button in the Post actions and the Caption actions; a visitor sees
   *  the Comments toggles, the fire-heart and the count. */
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
  /** This Post's Comment thread (#124), with its open state. The Post Comments
   *  toggle opens it in the Comments panel; without it, the toggle opens
   *  nothing. */
  postComments?: CommentThreadState;
  /** The shown Caption's Comment thread (#127), with its open state. The
   *  Caption Comments toggle opens it in the Comments panel. */
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

/** A comment count in words, for a Comments toggle's name (#210): "1 comment",
 *  "3 comments". */
const commentCountText = (count: number) => `${count} ${count === 1 ? "comment" : "comments"}`;

interface ActionsLineProps {
  /** The Comments toggle's label: "Post Comments" or "Caption Comments". */
  label: string;
  /** The comment count after the label. */
  count: number;
  /** Whether the toggle's thread is open in the Comments panel. */
  open: boolean;
  /** The panel's element id. */
  panelId: string;
  /** Disables the toggle, such as on a Post with no Caption. */
  toggleDisabled?: boolean;
  onToggle: () => void;
  /** The toggle, which takes focus when Escape closes its panel (#210). */
  toggleRef?: (el: HTMLButtonElement) => void;
  /** The errors of the line's actions. */
  errors: (string | null)[];
  /** Whether the viewer is a logged-in User: then the other actions sit at the
   *  right of the line (#210). */
  loggedIn?: boolean;
  /** The block's classes, such as its margin. */
  class?: string;
  /** The other actions: the fire-heart and count, Like, Add, Edit and Delete. */
  children: JSX.Element;
}

/**
 * One actions line (#210): the Post actions and the Caption actions share this
 * layout. The Comments toggle sits at the left: its label, the expand-arrow,
 * and the count. The arrow turns 180° while its thread is open, with the
 * Profile menu arrow's size and timing (#244). The arrow is visual only; the
 * toggle's name says the count in words, and neither toggle's name starts the
 * other's. For a logged-in User, the other actions sit at the right, and on a
 * narrow screen they wrap under the toggle. A visitor's fire-heart and count
 * sit right after the toggle. One alert per failed action goes under the line,
 * so one error never hides another.
 */
function ActionsLine(props: ActionsLineProps) {
  return (
    <div class={props.class}>
      <div
        class={`flex flex-wrap items-center gap-y-2 text-sm px-2 ${props.loggedIn ? "justify-between" : "gap-x-4"}`}
      >
        <button
          ref={(el) => props.toggleRef?.(el)}
          type="button"
          class="flex items-center font-bold hover:underline rounded p-2 -m-2 disabled:opacity-50 disabled:no-underline"
          aria-label={`${props.label}, ${commentCountText(props.count)}`}
          aria-expanded={props.open}
          aria-controls={props.panelId}
          disabled={props.toggleDisabled}
          onClick={() => props.onToggle()}
        >
          {props.label}
          <Icon
            name="expand-arrow"
            class={`w-4 h-4 ml-1 transition-transform duration-300 ${props.open ? "rotate-180" : ""}`}
          />
          <span class="font-light text-(--theme-card-fg) ml-2">{props.count}</span>
        </button>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">{props.children}</div>
      </div>
      <For each={props.errors.filter((e) => e !== null)}>
        {(error) => (
          <div role="alert" class="rounded bg-red-100 p-2 mt-2 text-red-700 text-sm">
            {error}
          </div>
        )}
      </For>
    </div>
  );
}

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
  // Add Caption (#121): the button sits in the Caption actions, the form in the
  // Caption line. A new Post starts on its caption, not on a form left open.
  const [addingCaption, setAddingCaption] = createSignal(false);
  let addCaptionRef: HTMLButtonElement | undefined;
  createEffect(on(postId, () => setAddingCaption(false), { defer: true }));
  // Return focus to the button the form was opened from.
  const closeCaptionForm = () => {
    setAddingCaption(false);
    addCaptionRef?.focus();
  };
  // The Post's thread in the Comments panel (#124). Its open state lives in the
  // view-model, which closes it when the selected Post changes.
  const commentsOpen = () => props.postComments?.open() ?? false;
  const commentsPanelId = () => `post-${postId()}-comments`;
  // The Caption's thread (#127), the same way. The view-model closes it when
  // the Caption shown changes.
  const captionCommentsOpen = () => props.captionComments?.open() ?? false;
  const captionCommentsPanelId = () => `post-${postId()}-caption-comments`;
  // Escape in the empty compose box closes the panel as a toggle click does
  // (#210): focus moves to the toggle, then the guarded close runs.
  let postToggleRef: HTMLButtonElement | undefined;
  let captionToggleRef: HTMLButtonElement | undefined;
  const closePostComments = () => {
    postToggleRef?.focus();
    props.postComments?.setOpen(false);
  };
  const closeCaptionComments = () => {
    captionToggleRef?.focus();
    props.captionComments?.setOpen(false);
  };
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
            class="hover:underline rounded p-2 -m-2"
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
      {/* The body (#210): the Author line, the Post actions, the Caption line,
          the Caption actions and the Comments panel. The last part sits two
          line heights (40px) above the card's bottom edge: pb-6 here plus the
          card's own pb-4. */}
      <div class="p-4 pb-6">
        {/* The Author line (#210): the avatar and name, the Post title and the
            Categories. The title is plain text, not a heading, and the
            separators are visual only. On a narrow screen, the line wraps, and
            nothing is truncated. */}
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mb-4">
          <Author
            avatarSrc={props.post.author.avatarUrl}
            name={props.post.author.name}
            href={trustedUrl("#")}
            onClick={notImplemented}
          />
          <span aria-hidden="true">-</span>
          <span class="min-w-0 wrap-break-word">{props.post.title}</span>
          <span aria-hidden="true">-</span>
          <For each={props.post.categories}>
            {(c) => (
              <button type="button" onClick={() => {}} class="theme-button text-sm">
                {c.name}
              </button>
            )}
          </For>
        </div>
        {/* The Post actions (#123): the Post Comments toggle and its count
            (#124), the fire-heart, count, Like, Add, Edit and Delete. A visitor
            sees the toggle, the fire-heart and the count. A logged-in User sees
            every button; Edit / Delete act for the Owner only. Add opens the
            one New Post dialog (#214). */}
        <ActionsLine
          class="mb-10"
          label="Post Comments"
          loggedIn={props.loggedIn}
          count={props.post.commentCount}
          open={commentsOpen()}
          panelId={commentsPanelId()}
          onToggle={() => props.postComments?.setOpen(!commentsOpen())}
          toggleRef={(el) => (postToggleRef = el)}
          errors={[toggleLike.error(), deletePost.error()]}
        >
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
        </ActionsLine>
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
        {/* The Caption actions (#123), for the Caption shown: the Caption
            Comments toggle and its count (#127), the fire-heart, count, Like,
            Add, Edit and Delete. A visitor sees the toggle, the fire-heart and
            the count of a Caption that exists. A logged-in User sees every
            button; one that cannot act now is disabled. */}
        <Show when={props.loggedIn || props.caption}>
          <ActionsLine
            label="Caption Comments"
            loggedIn={props.loggedIn}
            count={captionCommentCount()}
            open={captionCommentsOpen()}
            panelId={captionCommentsPanelId()}
            toggleDisabled={!props.caption}
            onToggle={() => props.captionComments?.setOpen(!captionCommentsOpen())}
            toggleRef={(el) => (captionToggleRef = el)}
            errors={[toggleCaptionLike.error(), deleteCaption.error()]}
          >
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
          </ActionsLine>
        </Show>
        {/* The Comments panel (#124, #127), under the Caption actions. It shows
            one thread at a time, the Post's or the Caption's (#210). Each
            element is always here, so its toggle's aria-controls resolves; the
            thread mounts only while open. The open panel's top border is the
            rule above it, not an <hr>, so screen readers announce no
            separator. */}
        <section
          id={commentsPanelId()}
          aria-label="Post Comments"
          hidden={!commentsOpen()}
          class="mt-4 space-y-2 border-t border-(--theme-muted) px-2 pt-4 text-sm"
        >
          <Show when={commentsOpen() && props.postComments}>
            {(postComments) => (
              <CommentThread
                id={commentsPanelId()}
                thread={postComments()}
                composeLabel="Post Comment"
                onClosePanel={closePostComments}
                loggedIn={props.loggedIn}
                userId={props.userId}
              />
            )}
          </Show>
        </section>
        <section
          id={captionCommentsPanelId()}
          aria-label="Caption Comments"
          hidden={!captionCommentsOpen()}
          class="mt-4 space-y-2 border-t border-(--theme-muted) px-2 pt-4 text-sm"
        >
          <Show when={captionCommentsOpen() && props.captionComments}>
            {(captionComments) => (
              <CommentThread
                id={captionCommentsPanelId()}
                thread={captionComments()}
                composeLabel="Caption Comment"
                onClosePanel={closeCaptionComments}
                loggedIn={props.loggedIn}
                userId={props.userId}
              />
            )}
          </Show>
        </section>
      </div>
    </article>
  );
}
