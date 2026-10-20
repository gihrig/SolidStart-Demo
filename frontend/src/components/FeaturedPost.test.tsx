import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { trustedUrl } from "~/lib/sanitizeUrl";
import { createDraftGuard, type DraftGuard } from "~/lib/createDraftGuard";
import { stubDialogModal } from "~/lib/test-utils";
import FeaturedPost from "./FeaturedPost";
import { DraftGuardContext } from "./DraftGuardContext";
import type { CommentThreadState } from "~/lib/jedi/createCommentThread";
import type { OwnerWrites } from "~/lib/jedi/createJediFeed";
import type { PostChanges, PostView, CaptionView, Like, CommentView } from "~/types/jedi";

// The Post edit dialog loads the Categories on mount (#187): the RPC client
// answers from memory.
vi.mock("~/lib/backend-rpc", () => ({
  publicRpc: vi.fn((method: string) =>
    Promise.resolve(
      method === "list_categories"
        ? [
            { id: 3, name: "Animals", icon: "dog" },
            { id: 6, name: "Cute", icon: "fire-heart" },
          ]
        : [],
    ),
  ),
  authenticatedRpc: vi.fn(() => Promise.reject(new Error("not used here"))),
}));

const post: PostView = {
  id: 1,
  author: { id: 1, name: "Lisa", avatarUrl: trustedUrl("https://example.com/lisa.png") },
  title: "Little Jedi",
  imageSrc: trustedUrl("https://example.com/jedi.jpg"),
  imageAlt: "Little Jedi cat",
  photographer: "Felicity Berkleef",
  photographerUrl: trustedUrl("https://example.com/felicity"),
  sourceUrl: trustedUrl("https://example.com/source"),
  categories: [
    { id: 3, name: "Animals", icon: "dog" },
    { id: 6, name: "Cute", icon: "fire-heart" },
  ],
  likeCount: 5,
  commentCount: 3,
};

const caption: CaptionView = {
  id: 1,
  postId: 1,
  author: { id: 1, name: "Lisa", avatarUrl: trustedUrl("https://example.com/lisa.png") },
  text: "Jedi Kitty protects the street",
  likeCount: 8,
  commentCount: 2,
};

// The Caption actions' Add button. The caption form's submit has the same name,
// "Add Caption", so pick the one that is not a submit.
const addCaptionTrigger = () =>
  screen
    .getAllByRole("button", { name: "Add Caption" })
    .find((b) => b.getAttribute("type") === "button");

// The parts of the Post card (#210). Each Comments toggle starts its actions
// line, and a Category button sits in the Author line.
const postToggle = () => screen.getByRole("button", { name: /^Post Comments, / });
const captionToggle = () => screen.getByRole("button", { name: /^Caption Comments, / });
const postActions = () => postToggle().parentElement!;
const captionActions = () => captionToggle().parentElement!;
const authorLine = () => screen.getByRole("button", { name: /^Animals$/ }).parentElement!;
const panelOf = (toggle: HTMLElement) =>
  document.getElementById(toggle.getAttribute("aria-controls")!)!;
// Whether `b` comes after `a` in the page, and is not inside it.
const follows = (a: Node, b: Node) =>
  !a.contains(b) && Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("<FeaturedPost />", () => {
  it("renders the post title and winning caption", () => {
    render(() => <FeaturedPost post={post} caption={caption} />);
    expect(screen.getByRole("heading", { name: /little jedi/i })).toBeInTheDocument();
    expect(screen.getByText(caption.text)).toBeInTheDocument();
  });

  it("renders an empty caption line when there is no winning caption", () => {
    render(() => <FeaturedPost post={post} caption={undefined} />);
    // No caption entity yet — the post still renders (title present).
    expect(screen.getByRole("heading", { name: /little jedi/i })).toBeInTheDocument();
    expect(screen.queryByText(caption.text)).not.toBeInTheDocument();
  });

  it("shows no Add Caption button by default (anonymous)", () => {
    render(() => <FeaturedPost post={post} caption={caption} />);
    expect(screen.queryByRole("button", { name: "Add Caption" })).toBeNull();
  });

  it("disables Add Caption while the captions load or when there are none (#123)", () => {
    render(() => <FeaturedPost post={post} caption={undefined} loggedIn />);
    expect(addCaptionTrigger()).toBeDisabled();
  });
  it("links to the photographer's flickr page", () => {
    render(() => <FeaturedPost post={post} caption={caption} />);
    const link = screen.getByRole("link", { name: /felicity berkleef/i });
    expect(link).toHaveAttribute("href", "https://example.com/felicity");
  });

  it("renders a chip button per category (tags == categories)", () => {
    render(() => <FeaturedPost post={post} caption={caption} />);
    expect(screen.getByRole("button", { name: /^Animals$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Cute$/ })).toBeInTheDocument();
  });

  it("shows the author and the comment / like counts", () => {
    render(() => <FeaturedPost post={post} caption={caption} />);
    expect(screen.getByText("Lisa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3 comments/i })).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("exposes accessible Like / Edit / Delete actions labelled by author", () => {
    render(() => <FeaturedPost post={post} caption={caption} loggedIn userId={1} />);
    expect(screen.getByRole("button", { name: /like post by lisa/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit post by lisa/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete post by lisa/i })).toBeInTheDocument();
  });

  it("shows the parts in order: the Author line, the Post actions, the Caption line, the Caption actions and the panels (#210)", () => {
    render(() => <FeaturedPost post={post} caption={caption} captionsLoaded loggedIn />);
    const parts = [
      authorLine(),
      postActions(),
      screen.getByText(caption.text),
      captionActions(),
      panelOf(postToggle()),
    ];
    for (const [i, part] of parts.slice(1).entries()) {
      expect(follows(parts[i], part), `part ${i + 1}`).toBe(true);
    }
    expect(follows(captionActions(), panelOf(captionToggle()))).toBe(true);
  });

  it("the Author line shows the avatar, the name, the title and the Categories (#210)", () => {
    render(() => <FeaturedPost post={post} caption={caption} />);
    const line = authorLine();
    expect(within(line).getByRole("img", { name: "Lisa" })).toBeInTheDocument();
    expect(line).toHaveTextContent(/^Lisa\s*-\s*Little Jedi\s*-\s*Animals\s*Cute$/);
    expect(within(line).queryByRole("heading"), "the title is plain text").toBeNull();
    const separators = [...line.querySelectorAll("[aria-hidden='true']")];
    expect(separators.map((s) => s.textContent)).toEqual(["-", "-"]);
  });
});

describe("<FeaturedPost /> — Add Caption (#121)", () => {
  const addButton = () => screen.queryByRole("button", { name: "Add Caption" });
  const input = () => screen.queryByLabelText("Your caption");
  const renderLoggedIn = (postSignal = createSignal(post)[0]) => {
    const user = userEvent.setup();
    render(() => <FeaturedPost post={postSignal()} caption={caption} loggedIn captionsLoaded />);
    return { user };
  };

  it("puts the Add Caption button in the Caption actions, not the Caption line", () => {
    renderLoggedIn();
    expect(captionActions()).toContainElement(addButton());
    expect(screen.getByText(caption.text)).not.toContainElement(addButton());
  });

  it("swaps the caption for the focused form, disabling the button, and back on Cancel", async () => {
    const { user } = renderLoggedIn();

    await user.click(addButton()!);
    expect(screen.queryByText(caption.text)).toBeNull();
    expect(input()).toHaveFocus();
    // The Add button stays, disabled (#123); the form's submit is the other one.
    expect(addCaptionTrigger()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText(caption.text)).toBeInTheDocument();
    expect(input()).toBeNull();
    expect(addButton()).toHaveFocus();
  });

  it("closes an open form when the selected Post changes", async () => {
    const [current, setCurrent] = createSignal(post);
    const { user } = renderLoggedIn(current);

    await user.click(addButton()!);
    expect(input()).toBeInTheDocument();

    setCurrent({ ...post, id: 2 });
    await waitFor(() => expect(input()).toBeNull());
    expect(screen.getByText(caption.text)).toBeInTheDocument();
  });

  it("reports a Draft while the caption is not blank; Cancel asks, and focus returns after Discard (#214)", async () => {
    const user = userEvent.setup();
    let guard!: DraftGuard;
    render(() => {
      guard = createDraftGuard();
      return (
        <DraftGuardContext.Provider value={guard}>
          <FeaturedPost post={post} caption={caption} loggedIn captionsLoaded />
        </DraftGuardContext.Provider>
      );
    });
    await user.click(addButton()!);
    await user.type(input()!, "  ");
    expect(guard.hasDraft(), "blank after a trim").toBe(false);
    await user.type(input()!, "draft");
    expect(guard.hasDraft()).toBe(true);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(guard.pending()).toBe(true);
    expect(input()).toHaveValue("  draft");
    guard.confirmMove();
    expect(input()).toBeNull();
    expect(guard.hasDraft()).toBe(false);
    expect(guard.notice()).toBeUndefined();
    expect(addButton(), "focus returns to Add").toHaveFocus();
  });

  it("keeps the form open and its text when the same Post is refetched", async () => {
    const [current, setCurrent] = createSignal(post);
    const { user } = renderLoggedIn(current);
    await user.click(addButton()!);
    await user.type(input()!, "draft");

    // A `posts` poke refetches the list: a new object for the same Post.
    setCurrent({ ...post });
    expect(input()).toHaveValue("draft");
  });
});

describe("<FeaturedPost /> — Like (#122)", () => {
  const likeButton = () => screen.getByRole("button", { name: /like post by lisa/i });
  const like: Like = { id: 1, likeCount: 6, liked: true };

  it("disables Like and shows the Post's count while the like state loads", () => {
    render(() => <FeaturedPost loggedIn post={post} caption={caption} />);
    expect(likeButton()).toBeDisabled();
    expect(likeButton()).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Likes:").parentElement).toHaveTextContent("Likes: 5");
  });

  it("shows the viewer's live count and pressed state", () => {
    render(() => (
      <FeaturedPost loggedIn post={post} caption={caption} like={like} onToggleLike={vi.fn()} />
    ));
    expect(likeButton()).toBeEnabled();
    expect(likeButton()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Likes:").parentElement).toHaveTextContent("Likes: 6");
  });

  it("calls onToggleLike on click", async () => {
    const user = userEvent.setup();
    const onToggleLike = vi.fn(() => Promise.resolve());
    render(() => (
      <FeaturedPost
        loggedIn
        post={post}
        caption={caption}
        like={like}
        onToggleLike={onToggleLike}
      />
    ));
    await user.click(likeButton());
    expect(onToggleLike).toHaveBeenCalledOnce();
  });

  it("keeps Like enabled while a toggle is in flight, so a fast click counts", async () => {
    const user = userEvent.setup();
    const onToggleLike = vi.fn(() => new Promise<void>(() => {}));
    render(() => (
      <FeaturedPost
        loggedIn
        post={post}
        caption={caption}
        like={like}
        onToggleLike={onToggleLike}
      />
    ));
    await user.click(likeButton());
    expect(likeButton()).toBeEnabled();
    await user.click(likeButton());
    expect(onToggleLike).toHaveBeenCalledTimes(2);
  });

  it("shows an alert when the toggle fails", async () => {
    const user = userEvent.setup();
    const onToggleLike = () => Promise.reject(new Error("Network down"));
    render(() => (
      <FeaturedPost
        loggedIn
        post={post}
        caption={caption}
        like={like}
        onToggleLike={onToggleLike}
      />
    ));
    await user.click(likeButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
  });
});

describe("<FeaturedPost /> — Caption actions (#123)", () => {
  const likeButton = () => screen.getByRole("button", { name: /like caption by lisa/i });
  const captionCount = () => screen.getByText("Caption likes:").parentElement;
  const captionLike: Like = { id: 1, likeCount: 9, liked: true };

  it("puts the Caption actions in order: the toggle, the fire-heart and count, Like, Add, Edit and Delete", () => {
    render(() => (
      <FeaturedPost
        loggedIn
        userId={1}
        post={post}
        caption={caption}
        captionsLoaded
        captionLike={captionLike}
      />
    ));
    const names = [...captionActions().querySelectorAll("button")].map(
      (b) => b.getAttribute("aria-label") ?? b.textContent,
    );
    expect(names).toEqual([
      "Caption Comments, 2 comments",
      "Like caption by Lisa",
      "Add Caption",
      "Edit caption by Lisa",
      "Delete caption by Lisa",
    ]);
    expect(captionActions()).toContainElement(captionCount());
  });

  it("labels the Add button 'Add', with the accessible name 'Add Caption'", () => {
    render(() => <FeaturedPost loggedIn post={post} caption={caption} captionsLoaded />);
    expect(screen.getByRole("button", { name: "Add Caption" })).toHaveTextContent(/^Add$/);
  });

  it("disables Like and shows the Caption's count while the like state loads", () => {
    render(() => <FeaturedPost loggedIn post={post} caption={caption} />);
    expect(likeButton()).toBeDisabled();
    expect(likeButton()).toHaveAttribute("aria-pressed", "false");
    expect(captionCount()).toHaveTextContent("Caption likes: 8");
  });

  it("shows the viewer's live Caption count and pressed state", () => {
    render(() => (
      <FeaturedPost
        loggedIn
        post={post}
        caption={caption}
        captionLike={captionLike}
        onToggleCaptionLike={vi.fn()}
      />
    ));
    expect(likeButton()).toBeEnabled();
    expect(likeButton()).toHaveAttribute("aria-pressed", "true");
    expect(captionCount()).toHaveTextContent("Caption likes: 9");
  });

  it("calls onToggleCaptionLike on click, not the Post's toggle", async () => {
    const user = userEvent.setup();
    const onToggleCaptionLike = vi.fn(() => Promise.resolve());
    const onToggleLike = vi.fn(() => Promise.resolve());
    render(() => (
      <FeaturedPost
        loggedIn
        post={post}
        caption={caption}
        captionLike={captionLike}
        onToggleCaptionLike={onToggleCaptionLike}
        onToggleLike={onToggleLike}
      />
    ));
    await user.click(likeButton());
    expect(onToggleCaptionLike).toHaveBeenCalledOnce();
    expect(onToggleLike).not.toHaveBeenCalled();
  });

  it("shows an alert when the Caption toggle fails", async () => {
    const user = userEvent.setup();
    const onToggleCaptionLike = () => Promise.reject(new Error("Network down"));
    render(() => (
      <FeaturedPost
        loggedIn
        post={post}
        caption={caption}
        captionLike={captionLike}
        onToggleCaptionLike={onToggleCaptionLike}
      />
    ));
    await user.click(likeButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
  });

  it("shows both errors, each under the actions line whose button failed (#210)", async () => {
    const user = userEvent.setup();
    render(() => (
      <FeaturedPost
        loggedIn
        post={post}
        caption={caption}
        like={{ id: 1, likeCount: 6, liked: true }}
        onToggleLike={() => Promise.reject(new Error("Post Like failed"))}
        captionLike={captionLike}
        onToggleCaptionLike={() => Promise.reject(new Error("Caption Like failed"))}
      />
    ));
    await user.click(likeButton());
    await user.click(screen.getByRole("button", { name: /like post by lisa/i }));
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
    const [postAlert, captionAlert] = screen.getAllByRole("alert");
    expect(postAlert).toHaveTextContent("Post Like failed");
    expect(captionAlert).toHaveTextContent("Caption Like failed");
    expect(follows(postActions(), postAlert)).toBe(true);
    expect(follows(postAlert, screen.getByText(caption.text))).toBe(true);
    expect(follows(captionActions(), captionAlert)).toBe(true);
    expect(follows(captionAlert, panelOf(captionToggle()))).toBe(true);
  });

  it("shows no Caption actions when the Post has no Caption", () => {
    render(() => <FeaturedPost post={post} caption={undefined} />);
    expect(screen.queryByRole("button", { name: /like caption/i })).toBeNull();
    expect(screen.queryByText("Caption likes:")).toBeNull();
  });
});

describe("<FeaturedPost /> — visibility rule, Post actions and Caption actions (#123)", () => {
  // Caption 2 is by Bart (id 3), so Lisa (id 1) owns the Post but not the Caption.
  const bartsCaption: CaptionView = {
    ...caption,
    id: 2,
    author: { id: 3, name: "Bart", avatarUrl: trustedUrl("https://example.com/bart.png") },
  };
  const button = (name: RegExp | string) => screen.queryByRole("button", { name });

  it("shows a visitor who is not logged in the Comments toggles, the fire-heart and the count", () => {
    render(() => <FeaturedPost post={post} caption={bartsCaption} captionsLoaded />);
    expect(postToggle()).toBeEnabled();
    expect(captionToggle()).toBeEnabled();
    expect(screen.getByText("Likes:").parentElement).toHaveTextContent("Likes: 5");
    expect(screen.getByText("Caption likes:").parentElement).toHaveTextContent("Caption likes: 8");
    for (const name of [
      /like post/i,
      /edit post/i,
      /delete post/i,
      /like caption/i,
      "Add Caption",
      /edit caption/i,
      /delete caption/i,
    ]) {
      expect(button(name), String(name)).toBeNull();
    }
  });

  const enabled = (name: RegExp | string) => !button(name)!.hasAttribute("disabled");

  it("shows a logged-in User every button in both actions lines, in order", () => {
    render(() => (
      <FeaturedPost post={post} caption={bartsCaption} captionsLoaded loggedIn userId={2} />
    ));
    const names = (el: Element) =>
      [...el.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(names(captionActions())).toEqual([
      "Caption Comments, 2 comments",
      "Like caption by Bart",
      "Add Caption",
      "Edit caption by Bart",
      "Delete caption by Bart",
    ]);
    expect(names(postActions())).toEqual([
      "Post Comments, 3 comments",
      "Like post by Lisa",
      "Add Post",
      "Edit Post by Lisa",
      "Delete Post by Lisa",
    ]);
  });

  it("disables another User's Edit / Delete, and enables Add", () => {
    render(() => (
      <FeaturedPost post={post} caption={bartsCaption} captionsLoaded loggedIn userId={2} />
    ));
    expect(addCaptionTrigger()).toBeEnabled();
    expect(enabled("Add Post")).toBe(true);
    for (const name of [/edit post/i, /delete post/i, /edit caption/i, /delete caption/i]) {
      expect(enabled(name), String(name)).toBe(false);
    }
  });

  it("enables Edit / Delete for the Owner only, on each line", () => {
    render(() => (
      <FeaturedPost post={post} caption={bartsCaption} captionsLoaded loggedIn userId={1} />
    ));
    expect(enabled(/edit post by lisa/i)).toBe(true);
    expect(enabled(/delete post by lisa/i)).toBe(true);
    expect(enabled(/edit caption/i)).toBe(false);
    expect(enabled(/delete caption/i)).toBe(false);
  });

  it("keeps Edit / Delete disabled until the User's id loads", () => {
    render(() => <FeaturedPost post={post} caption={caption} captionsLoaded loggedIn />);
    for (const name of [/edit post/i, /delete post/i, /edit caption/i, /delete caption/i]) {
      expect(enabled(name), String(name)).toBe(false);
    }
  });

  it("shows a logged-in User the Caption buttons, disabled, on a Post with no Caption", () => {
    render(() => <FeaturedPost post={post} captionsLoaded loggedIn userId={1} />);
    expect(screen.getByText("Caption likes:").parentElement).toHaveTextContent("Caption likes: 0");
    expect(addCaptionTrigger()).toBeDisabled();
    for (const name of [/like caption/i, /edit caption/i, /delete caption/i]) {
      expect(enabled(name), String(name)).toBe(false);
    }
  });

  it("lays out the Caption actions as the Post actions (#210)", () => {
    render(() => <FeaturedPost post={post} caption={caption} captionsLoaded loggedIn />);
    expect(captionActions().className).toBe(postActions().className);
    const group = (toggle: HTMLElement) => toggle.nextElementSibling!.className;
    expect(group(captionToggle())).toBe(group(postToggle()));
  });

  it("the Add in the Post actions calls onAddPost with itself, the opener (#214)", async () => {
    const onAddPost = vi.fn();
    const user = userEvent.setup();
    render(() => (
      <FeaturedPost post={post} caption={caption} captionsLoaded loggedIn onAddPost={onAddPost} />
    ));
    expect(button("Add Post")).toHaveTextContent(/^Add$/);

    await user.click(button("Add Post")!);

    expect(onAddPost).toHaveBeenCalledWith(button("Add Post"));
  });
});

describe("<FeaturedPost /> — the Comments panel (#124)", () => {
  // A thread with one Comment by User 2, and its open state; the writes are
  // not used here. The view-model owns the open state, so a fresh one per test.
  const fakePostComments = (): CommentThreadState => {
    const [open, setOpen] = createSignal(false);
    const [comments] = createSignal<CommentView[] | undefined>([
      {
        id: 9,
        parentId: 1,
        author: { id: 2, name: "Homer", avatarUrl: trustedUrl("") },
        contentHtml: "<p>Nice cat</p>",
        ctime: "2026-10-10T12:00:00Z",
        mtime: "2026-10-10T12:00:00Z",
      },
    ]);
    return {
      open,
      setOpen,
      draftScope: Symbol("post-comments"),
      comments,
      deleted: () => false,
      error: () => undefined,
      add: () => Promise.resolve(),
      update: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      source: () => Promise.resolve(""),
    };
  };
  const toggle = () => screen.getByRole("button", { name: /3 comments/i });
  const panel = () => document.getElementById(toggle().getAttribute("aria-controls")!);

  it("keeps the panel element while closed, hidden and empty, so aria-controls resolves", () => {
    const postComments = fakePostComments();
    render(() => <FeaturedPost post={post} caption={caption} postComments={postComments} />);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(panel()).toBeInTheDocument();
    expect(panel()).not.toBeVisible();
    expect(panel()).toBeEmptyDOMElement();
  });

  it("the Comments toggle opens and closes the thread panel", async () => {
    const user = userEvent.setup();
    const postComments = fakePostComments();
    render(() => <FeaturedPost post={post} caption={caption} postComments={postComments} />);

    await user.click(toggle());
    expect(postComments.open()).toBe(true);
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Post Comments" })).toBe(panel());
    expect(panel()).toHaveTextContent("Nice cat");

    await user.click(toggle());
    expect(postComments.open()).toBe(false);
    expect(screen.queryByRole("region", { name: "Post Comments" })).toBeNull();
    expect(panel()).toBeEmptyDOMElement();
  });

  it("the toggle reads 'Post Comments + 3', with − while open; the glyph is aria-hidden (#210)", async () => {
    const user = userEvent.setup();
    const postComments = fakePostComments();
    render(() => <FeaturedPost post={post} caption={caption} postComments={postComments} />);
    const glyph = () => toggle().querySelector("[aria-hidden='true']");
    expect(toggle()).toHaveTextContent(/^Post Comments\s*\+\s*3$/);
    expect(glyph()).toHaveTextContent(/^\+$/);

    await user.click(toggle());
    expect(toggle()).toHaveTextContent(/^Post Comments\s*−\s*3$/);
    expect(glyph()).toHaveTextContent(/^−$/);
  });

  it("Escape in the empty compose box closes the panel; focus moves to the toggle (#210)", async () => {
    const user = userEvent.setup();
    const postComments = fakePostComments();
    render(() => (
      <FeaturedPost post={post} caption={caption} postComments={postComments} loggedIn userId={2} />
    ));
    await user.click(toggle());
    await user.click(screen.getByRole("textbox", { name: "Post Comment" }));
    await user.keyboard("{Escape}");
    expect(postComments.open()).toBe(false);
    expect(panel()).toBeEmptyDOMElement();
    expect(toggle()).toHaveFocus();
  });

  it("sits under the Caption actions; its top border is the rule, with no separator (#210)", async () => {
    const user = userEvent.setup();
    const postComments = fakePostComments();
    render(() => <FeaturedPost post={post} caption={caption} postComments={postComments} />);
    expect(follows(captionActions(), panel()!)).toBe(true);

    await user.click(toggle());
    expect(panel()).toHaveClass("border-t");
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("a refetched Post keeps the panel open and the draft", async () => {
    const user = userEvent.setup();
    const [shown, setShown] = createSignal(post);
    const postComments = fakePostComments();
    render(() => (
      <FeaturedPost
        post={shown()}
        caption={caption}
        postComments={postComments}
        loggedIn
        userId={2}
      />
    ));
    await user.click(toggle());
    await user.type(screen.getByRole("textbox", { name: "Post Comment" }), "draft");

    // A `posts` poke refetches the list: a new object for the same Post.
    setShown({ ...post, commentCount: 3 });
    expect(screen.getByRole("textbox", { name: "Post Comment" })).toHaveValue("draft");
  });
});

describe("<FeaturedPost /> — the Caption Comments panel (#127)", () => {
  // A thread with one Comment, and its open state; the writes are not used
  // here.
  const fakeThread = (contentHtml: string): CommentThreadState => {
    const [open, setOpen] = createSignal(false);
    const [comments] = createSignal<CommentView[] | undefined>([
      {
        id: 9,
        parentId: 1,
        author: { id: 2, name: "Homer", avatarUrl: trustedUrl("") },
        contentHtml,
        ctime: "2026-10-10T12:00:00Z",
        mtime: "2026-10-10T12:00:00Z",
      },
    ]);
    return {
      open,
      setOpen,
      draftScope: Symbol("comments"),
      comments,
      deleted: () => false,
      error: () => undefined,
      add: () => Promise.resolve(),
      update: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      source: () => Promise.resolve(""),
    };
  };
  const toggle = () => screen.getByRole("button", { name: "Caption Comments, 2 comments" });
  const panel = () => document.getElementById(toggle().getAttribute("aria-controls")!);

  it("shows the toggle first in the Caption actions, with the Caption's comment count", () => {
    render(() => <FeaturedPost post={post} caption={caption} captionsLoaded loggedIn />);
    expect(toggle()).toHaveTextContent(/^Caption Comments\s*\+\s*2$/);
    expect(toggle().parentElement!.firstElementChild).toBe(toggle());
    expect(toggle()).toBeEnabled();
  });

  it("names each toggle by its label and its count in words; a count of one says 1 comment (#210)", () => {
    render(() => (
      <FeaturedPost post={post} caption={{ ...caption, commentCount: 1 }} captionsLoaded />
    ));
    expect(screen.getByRole("button", { name: "Post Comments, 3 comments" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Caption Comments, 1 comment" })).toBeInTheDocument();
  });

  it("shows a visitor the toggle only when a Caption exists", () => {
    const { unmount } = render(() => <FeaturedPost post={post} caption={caption} />);
    expect(toggle()).toBeEnabled();
    unmount();

    render(() => <FeaturedPost post={post} caption={undefined} />);
    expect(screen.queryByRole("button", { name: /^Caption Comments/ })).toBeNull();
  });

  it("shows a logged-in User the toggle, disabled, on a Post with no Caption", () => {
    render(() => <FeaturedPost post={post} captionsLoaded loggedIn userId={1} />);
    expect(screen.getByRole("button", { name: "Caption Comments, 0 comments" })).toBeDisabled();
  });

  it("the toggle opens and closes the Caption thread panel", async () => {
    const user = userEvent.setup();
    const captionComments = fakeThread("<p>Nice caption</p>");
    render(() => <FeaturedPost post={post} caption={caption} captionComments={captionComments} />);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(panel()).not.toBeVisible();

    await user.click(toggle());
    expect(captionComments.open()).toBe(true);
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Caption Comments" })).toBe(panel());
    expect(panel()).toHaveTextContent("Nice caption");
    expect(toggle()).toHaveTextContent(/^Caption Comments\s*−\s*2$/);

    await user.click(toggle());
    expect(captionComments.open()).toBe(false);
    expect(panel()).toBeEmptyDOMElement();
  });

  it("Escape in the empty compose box closes the panel; focus moves to the toggle (#210)", async () => {
    const user = userEvent.setup();
    const captionComments = fakeThread("<p>Nice caption</p>");
    render(() => (
      <FeaturedPost
        post={post}
        caption={caption}
        captionComments={captionComments}
        loggedIn
        userId={2}
      />
    ));
    await user.click(toggle());
    await user.click(screen.getByRole("textbox", { name: "Caption Comment" }));
    await user.keyboard("{Escape}");
    expect(captionComments.open()).toBe(false);
    expect(toggle()).toHaveFocus();
  });

  it("opens in the Post panel's place, under the Caption actions (#210)", async () => {
    const user = userEvent.setup();
    const postComments = fakeThread("<p>On the Post</p>");
    const captionComments = fakeThread("<p>On the Caption</p>");
    render(() => (
      <FeaturedPost
        post={post}
        caption={caption}
        postComments={postComments}
        captionComments={captionComments}
        loggedIn
        userId={2}
      />
    ));
    // The view-model opens one thread at a time; these fakes let both open, so
    // the ids can be checked below.
    await user.click(toggle());
    await user.click(screen.getByRole("button", { name: "Post Comments, 3 comments" }));

    const captionPanel = screen.getByRole("region", { name: "Caption Comments" });
    const postPanel = screen.getByRole("region", { name: "Post Comments" });
    expect(captionPanel.parentElement).toBe(postPanel.parentElement);
    expect(follows(captionActions(), captionPanel)).toBe(true);
    expect(follows(captionActions(), postPanel)).toBe(true);
    expect(captionPanel).toHaveTextContent("On the Caption");
    expect(postPanel).toHaveTextContent("On the Post");

    // Both threads hold a Comment with id 9: with both edit forms open, each
    // panel's element ids stay unique.
    for (const edit of screen.getAllByRole("button", { name: "Edit comment" })) {
      await user.click(edit);
    }
    expect(screen.getAllByRole("textbox", { name: "Edit your comment" })).toHaveLength(2);
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/** The Owner's writes on one subject, as the view-model holds them (#187). */
function fakeOwner<Changes>(
  writes: Partial<Omit<OwnerWrites<Changes>, "edit">> = {},
): OwnerWrites<Changes> {
  const [open, setOpen] = createSignal(false);
  return {
    edit: { open, setOpen, draftScope: Symbol("edit") },
    save: writes.save ?? (() => Promise.resolve()),
    remove: writes.remove ?? (() => Promise.resolve()),
    removeDiscardsDraft: writes.removeDiscardsDraft ?? (() => false),
  };
}

describe("<FeaturedPost /> — the Owner's delete (#187)", () => {
  const T1 = "Delete this Post? Its Captions, Comments and Likes are deleted too.";
  const T2 = "Delete this Caption? Its Comments and Likes are deleted too.";

  function renderOwner(props: {
    onDeletePost?: () => Promise<void>;
    onDeleteCaption?: () => Promise<void>;
    postDeleteDiscardsDraft?: () => boolean;
  }) {
    stubDialogModal();
    const postOwner = fakeOwner<PostChanges>({
      remove: props.onDeletePost,
      removeDiscardsDraft: props.postDeleteDiscardsDraft,
    });
    const captionOwner = fakeOwner<string>({ remove: props.onDeleteCaption });
    render(() => (
      <FeaturedPost
        loggedIn
        userId={1}
        post={post}
        caption={caption}
        captionsLoaded
        postOwner={postOwner}
        captionOwner={captionOwner}
      />
    ));
  }
  const confirm = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(screen.getByRole("button", { name }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
  };

  it("asks the Post question, deletes on Delete and moves focus to the Post title", async () => {
    const user = userEvent.setup();
    const onDeletePost = vi.fn(() => Promise.resolve());
    renderOwner({ onDeletePost, postDeleteDiscardsDraft: () => true });

    await user.click(screen.getByRole("button", { name: "Delete Post by Lisa" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      `${T1} Your unsaved changes will be discarded.`,
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDeletePost).toHaveBeenCalledExactlyOnceWith(post.id);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Little Jedi" })).toHaveFocus());
  });

  it("asks the Caption question, deletes on Delete and moves focus to the Caption line", async () => {
    const user = userEvent.setup();
    const onDeleteCaption = vi.fn(() => Promise.resolve());
    renderOwner({ onDeleteCaption });

    await user.click(screen.getByRole("button", { name: "Delete caption by Lisa" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName(T2);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDeleteCaption).toHaveBeenCalledExactlyOnceWith(caption.id);
    await waitFor(() => expect(screen.getByText(caption.text).closest("[tabindex]")).toHaveFocus());
  });

  it("shows the delete error, and focus stays on Delete", async () => {
    const user = userEvent.setup();
    // A rejection that is not an Error shows the fallback text (T13).
    const fail = () => Promise.reject({ status: 500 });
    renderOwner({ onDeletePost: fail, onDeleteCaption: fail });

    await confirm(user, "Delete Post by Lisa");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete the Post");
    expect(screen.getByRole("button", { name: "Delete Post by Lisa" })).toHaveFocus();

    await confirm(user, "Delete caption by Lisa");
    await waitFor(() =>
      expect(screen.getAllByRole("alert").map((a) => a.textContent)).toContain(
        "Could not delete the Caption",
      ),
    );
  });
});

describe("<FeaturedPost /> — the Owner's edits (#187)", () => {
  const unlocked: CaptionView = { ...caption, likeCount: 0, commentCount: 0 };

  function renderOwner(shown: CaptionView = unlocked) {
    stubDialogModal();
    const onUpdatePost = vi.fn(() => Promise.resolve());
    const onUpdateCaption = vi.fn(() => Promise.resolve());
    const postOwner = fakeOwner<PostChanges>({ save: onUpdatePost });
    const captionOwner = fakeOwner<string>({ save: onUpdateCaption });
    const guard = createDraftGuard();
    render(() => (
      <DraftGuardContext.Provider value={guard}>
        <FeaturedPost
          loggedIn
          userId={1}
          post={post}
          caption={shown}
          captionsLoaded
          postOwner={postOwner}
          captionOwner={captionOwner}
        />
      </DraftGuardContext.Provider>
    ));
    return {
      user: userEvent.setup(),
      guard,
      postEdit: postOwner.edit,
      captionEdit: captionOwner.edit,
      onUpdatePost,
      onUpdateCaption,
    };
  }
  const button = (name: string) => screen.getByRole("button", { name });

  it("the Edit in the Post actions opens the Edit Post dialog; Save sends this Post's changes", async () => {
    const { user, postEdit, onUpdatePost } = renderOwner();
    await user.click(button("Edit Post by Lisa"));
    expect(postEdit.open()).toBe(true);
    const dialog = screen.getByRole("dialog", { name: "Edit Post" });
    const title = within(dialog).getByLabelText("Title");

    await user.type(title, "!");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(onUpdatePost).toHaveBeenCalledWith(1, { title: "Little Jedi!" });
    await waitFor(() => expect(postEdit.open()).toBe(false));
    expect(screen.queryByRole("dialog", { name: "Edit Post" })).toBeNull();
    expect(button("Edit Post by Lisa"), "focus returns to Edit").toHaveFocus();
  });

  it("the Caption edit form takes the place of the Caption text", async () => {
    const { user, captionEdit, onUpdateCaption } = renderOwner();
    await user.click(button("Edit caption by Lisa"));
    expect(captionEdit.open()).toBe(true);
    const input = screen.getByLabelText("Edit your caption") as HTMLInputElement;
    expect(input.value).toBe(caption.text);
    expect(screen.queryByText(caption.text, { selector: "p" })).toBeNull();

    // One form in the Caption line: Add, Edit and Delete wait.
    expect(button("Add Caption")).toBeDisabled();
    expect(button("Edit caption by Lisa")).toBeDisabled();
    expect(button("Delete caption by Lisa")).toBeDisabled();

    await user.type(input, "!");
    await user.click(button("Save"));
    expect(onUpdateCaption).toHaveBeenCalledWith(caption.id, `${caption.text}!`);
    await waitFor(() => expect(captionEdit.open()).toBe(false));
    expect(button("Edit caption by Lisa"), "focus returns to Edit").toHaveFocus();
  });

  it("the Caption edit's Cancel with a Draft asks; focus returns to Edit after Discard (#214)", async () => {
    const { user, guard, captionEdit } = renderOwner();
    await user.click(button("Edit caption by Lisa"));
    await user.type(screen.getByLabelText("Edit your caption"), "!");

    await user.click(button("Cancel"));
    expect(guard.pending()).toBe(true);
    expect(captionEdit.open()).toBe(true);
    guard.confirmMove();
    expect(captionEdit.open()).toBe(false);
    expect(button("Edit caption by Lisa")).toHaveFocus();
  });

  it("disables the Caption's Edit while the Add form is open", async () => {
    const { user } = renderOwner();
    await user.click(addCaptionTrigger()!);
    expect(button("Edit caption by Lisa")).toBeDisabled();
  });

  it("a locked Caption explains itself, and focus returns to Edit", async () => {
    const { user, captionEdit } = renderOwner(caption);
    await user.click(button("Edit caption by Lisa"));
    expect(captionEdit.open()).toBe(false);
    const notice = screen.getByRole("dialog", {
      name: "A Caption with Likes or Comments cannot be edited.",
    });
    await user.click(within(notice).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button("Edit caption by Lisa")).toHaveFocus();
  });
});
