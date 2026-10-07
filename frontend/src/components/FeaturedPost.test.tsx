import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { trustedUrl } from "~/lib/sanitizeUrl";
import FeaturedPost from "./FeaturedPost";
import type { PostView, CaptionView, Like } from "~/types/jedi";

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
};

// The categories line's Add button. The caption form's submit has the same name,
// "Add Caption", so pick the one that is not a submit.
const addCaptionTrigger = () =>
  screen
    .getAllByRole("button", { name: "Add Caption" })
    .find((b) => b.getAttribute("type") === "button");

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
    expect(screen.getByRole("link", { name: /3 comments/i })).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("exposes accessible Like / Edit / Delete actions labelled by author", () => {
    render(() => <FeaturedPost post={post} caption={caption} loggedIn userId={1} />);
    expect(screen.getByRole("button", { name: /like post by lisa/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit post by lisa/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete post by lisa/i })).toBeInTheDocument();
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

  it("puts the Add Caption button on the categories line, not the caption line", () => {
    renderLoggedIn();
    const categoriesLine = screen.getByRole("button", { name: /^Animals$/ }).parentElement!;
    expect(categoriesLine).toContainElement(addButton());
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

  it("puts the Caption actions on the categories line, right of the categories, in order", () => {
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
    const categoriesLine = screen.getByRole("button", { name: /^Animals$/ }).parentElement!;
    const names = [...categoriesLine.querySelectorAll("button")].map(
      (b) => b.getAttribute("aria-label") ?? b.textContent,
    );
    expect(names).toEqual([
      "Animals",
      "Cute",
      "Like caption by Lisa",
      "Add Caption",
      "Edit caption by Lisa",
      "Delete caption by Lisa",
    ]);
    expect(categoriesLine).toContainElement(captionCount());
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

  it("shows both errors when the Caption toggle and the Post toggle fail", async () => {
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
    const alerts = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(alerts).toEqual(["Caption Like failed", "Post Like failed"]);
  });

  it("shows no Caption actions when the Post has no Caption", () => {
    render(() => <FeaturedPost post={post} caption={undefined} />);
    expect(screen.queryByRole("button", { name: /like caption/i })).toBeNull();
    expect(screen.queryByText("Caption likes:")).toBeNull();
  });
});

describe("<FeaturedPost /> — visibility rule, Post line and Caption line (#123)", () => {
  // Caption 2 is by Bart (id 3), so Lisa (id 1) owns the Post but not the Caption.
  const bartsCaption: CaptionView = {
    ...caption,
    id: 2,
    author: { id: 3, name: "Bart", avatarUrl: trustedUrl("https://example.com/bart.png") },
  };
  const button = (name: RegExp | string) => screen.queryByRole("button", { name });

  it("shows a visitor who is not logged in only the fire-heart and the count", () => {
    render(() => <FeaturedPost post={post} caption={bartsCaption} captionsLoaded />);
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

  it("shows a logged-in User every button on both lines, in order", () => {
    render(() => (
      <FeaturedPost post={post} caption={bartsCaption} captionsLoaded loggedIn userId={2} />
    ));
    const categoriesLine = screen.getByRole("button", { name: /^Animals$/ }).parentElement!;
    const postLine = screen.getByText("Likes:").closest("div.justify-between")!;
    // The buttons on the line itself, not the ones inside the closed New Post dialog.
    const names = (el: Element) =>
      [...el.querySelectorAll("button")]
        .filter((b) => !b.closest("dialog"))
        .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(names(categoriesLine)).toEqual([
      "Animals",
      "Cute",
      "Like caption by Bart",
      "Add Caption",
      "Edit caption by Bart",
      "Delete caption by Bart",
    ]);
    expect(names(postLine)).toEqual([
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

  it("puts the Caption buttons at the same right margin as the Post buttons", () => {
    render(() => <FeaturedPost post={post} caption={caption} captionsLoaded loggedIn />);
    const captionGroup = button(/like caption/i)!.parentElement!;
    const postLine = screen.getByText("Likes:").closest("div.justify-between")!;
    expect(captionGroup).toHaveClass("pr-2");
    expect(postLine).toHaveClass("px-2");
  });

  it("opens the New Post dialog from the Post line's Add button", async () => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    const user = userEvent.setup();
    render(() => <FeaturedPost post={post} caption={caption} captionsLoaded loggedIn />);
    expect(button("Add Post")).toHaveTextContent(/^Add$/);

    await user.click(button("Add Post")!);

    const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog).toHaveAccessibleName("New Post");
  });
});
