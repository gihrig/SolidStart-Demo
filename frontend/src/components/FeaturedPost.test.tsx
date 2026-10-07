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

  it("shows no Add Caption button while the captions load or when there are none", () => {
    render(() => <FeaturedPost post={post} caption={undefined} canAddCaption />);
    expect(screen.queryByRole("button", { name: "Add Caption" })).toBeNull();
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
    render(() => <FeaturedPost post={post} caption={caption} />);
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
    render(() => (
      <FeaturedPost post={postSignal()} caption={caption} canAddCaption captionsLoaded />
    ));
    return { user };
  };

  it("puts the Add Caption button on the categories line, not the caption line", () => {
    renderLoggedIn();
    const categoriesLine = screen.getByRole("button", { name: /^Animals$/ }).parentElement!;
    expect(categoriesLine).toContainElement(addButton());
    expect(screen.getByText(caption.text)).not.toContainElement(addButton());
  });

  it("swaps the caption for the focused form, hiding the button, and back on Cancel", async () => {
    const { user } = renderLoggedIn();

    await user.click(addButton()!);
    expect(screen.queryByText(caption.text)).toBeNull();
    expect(input()).toHaveFocus();
    expect(screen.getAllByRole("button", { name: "Add Caption" })).toHaveLength(1); // the submit

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

  it("disables Like and shows the Post's count without a like state (anonymous)", () => {
    render(() => <FeaturedPost post={post} caption={caption} />);
    expect(likeButton()).toBeDisabled();
    expect(likeButton()).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Likes:").parentElement).toHaveTextContent("Likes: 5");
  });

  it("shows the viewer's live count and pressed state", () => {
    render(() => <FeaturedPost post={post} caption={caption} like={like} onToggleLike={vi.fn()} />);
    expect(likeButton()).toBeEnabled();
    expect(likeButton()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Likes:").parentElement).toHaveTextContent("Likes: 6");
  });

  it("calls onToggleLike on click", async () => {
    const user = userEvent.setup();
    const onToggleLike = vi.fn(() => Promise.resolve());
    render(() => (
      <FeaturedPost post={post} caption={caption} like={like} onToggleLike={onToggleLike} />
    ));
    await user.click(likeButton());
    expect(onToggleLike).toHaveBeenCalledOnce();
  });

  it("keeps Like enabled while a toggle is in flight, so a fast click counts", async () => {
    const user = userEvent.setup();
    const onToggleLike = vi.fn(() => new Promise<void>(() => {}));
    render(() => (
      <FeaturedPost post={post} caption={caption} like={like} onToggleLike={onToggleLike} />
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
      <FeaturedPost post={post} caption={caption} like={like} onToggleLike={onToggleLike} />
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
        post={post}
        caption={caption}
        canAddCaption
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
    render(() => <FeaturedPost post={post} caption={caption} canAddCaption captionsLoaded />);
    expect(screen.getByRole("button", { name: "Add Caption" })).toHaveTextContent(/^Add$/);
  });

  it("disables Like and shows the Caption's count without a like state (anonymous)", () => {
    render(() => <FeaturedPost post={post} caption={caption} />);
    expect(likeButton()).toBeDisabled();
    expect(likeButton()).toHaveAttribute("aria-pressed", "false");
    expect(captionCount()).toHaveTextContent("Caption likes: 8");
  });

  it("shows the viewer's live Caption count and pressed state", () => {
    render(() => (
      <FeaturedPost
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
        post={post}
        caption={caption}
        captionLike={captionLike}
        onToggleCaptionLike={onToggleCaptionLike}
      />
    ));
    await user.click(likeButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
  });

  it("shows no Caption actions when the Post has no Caption", () => {
    render(() => <FeaturedPost post={post} caption={undefined} />);
    expect(screen.queryByRole("button", { name: /like caption/i })).toBeNull();
    expect(screen.queryByText("Caption likes:")).toBeNull();
  });
});
