import { describe, it, expect } from "vite-plus/test";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { trustedUrl } from "~/lib/sanitizeUrl";
import FeaturedPost from "./FeaturedPost";
import type { PostView, CaptionView } from "~/types/jedi";

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
