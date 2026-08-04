import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { PostView } from "~/types/jedi";
import TopPhotosCard from "./TopPhotosCard";

const makePost = (id: number, name: string, likeCount: number): PostView => ({
  id,
  author: { id, name, avatarUrl: trustedUrl(`https://example.com/${name}.png`) },
  title: `Post ${id}`,
  imageSrc: trustedUrl(`https://example.com/${id}.jpg`),
  imageAlt: `Post ${id} photo`,
  photographer: "Someone",
  photographerUrl: trustedUrl("https://example.com/someone"),
  sourceUrl: trustedUrl("https://example.com/source"),
  categories: [],
  likeCount,
  commentCount: 0,
});

const posts = [makePost(1, "Lisa", 5), makePost(2, "Homer", 4)];

describe("<TopPhotosCard />", () => {
  it("renders a listbox option per ranked post with author and likes", () => {
    render(() => (
      <TopPhotosCard posts={() => posts} selectedPost={() => posts[0]} onSelect={vi.fn()} />
    ));
    expect(screen.getByRole("listbox", { name: "Top Photos" })).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Lisa");
    expect(options[0]).toHaveTextContent("(5 Likes)");
    expect(screen.getByAltText("Post 1 photo")).toBeInTheDocument();
  });

  it("marks the selected post's row as selected", () => {
    render(() => (
      <TopPhotosCard posts={() => posts} selectedPost={() => posts[1]} onSelect={vi.fn()} />
    ));
    const options = screen.getAllByRole("option");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect with the clicked post's id (not its index)", () => {
    const onSelect = vi.fn();
    render(() => (
      <TopPhotosCard posts={() => posts} selectedPost={() => posts[0]} onSelect={onSelect} />
    ));
    screen.getAllByRole("option")[1].click();
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("selects by id via the keyboard (roving listbox, #33-a)", () => {
    const [selectedId, setSelectedId] = createSignal(1);
    render(() => (
      <TopPhotosCard
        posts={() => posts}
        selectedPost={() => posts.find((p) => p.id === selectedId())}
        onSelect={setSelectedId}
      />
    ));
    const listbox = screen.getByRole("listbox", { name: "Top Photos" });
    listbox.focus();
    listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(selectedId()).toBe(2);
  });

  it("renders no options before the posts resource resolves", () => {
    render(() => (
      <TopPhotosCard posts={() => undefined} selectedPost={() => undefined} onSelect={vi.fn()} />
    ));
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("shows a 'No Posts in <category>' message instead of the list when emptyLabel is set", () => {
    render(() => (
      <TopPhotosCard
        posts={() => []}
        selectedPost={() => undefined}
        onSelect={vi.fn()}
        emptyLabel={() => "People"}
      />
    ));
    expect(screen.getByText(/no posts in people/i)).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("renders the listbox (no message) when emptyLabel is undefined", () => {
    render(() => (
      <TopPhotosCard
        posts={() => posts}
        selectedPost={() => posts[0]}
        onSelect={vi.fn()}
        emptyLabel={() => undefined}
      />
    ));
    expect(screen.getByRole("listbox", { name: "Top Photos" })).toBeInTheDocument();
    expect(screen.queryByText(/no posts/i)).not.toBeInTheDocument();
  });
});
