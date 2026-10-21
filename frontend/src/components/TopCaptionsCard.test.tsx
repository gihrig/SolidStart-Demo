import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen, within } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { CaptionView } from "~/types/jedi";
import TopCaptionsCard from "./TopCaptionsCard";

const makeCaption = (id: number, name: string, likeCount: number): CaptionView => ({
  id,
  postId: 1,
  author: { id, name, avatarUrl: trustedUrl(`https://example.com/${name}.png`) },
  text: `Caption ${id}`,
  likeCount,
  commentCount: 0,
});

const captions = [makeCaption(1, "Lisa", 8), makeCaption(2, "Bart", 5)];

describe("<TopCaptionsCard />", () => {
  it("renders a listbox option per caption with author and likes", () => {
    render(() => (
      <TopCaptionsCard
        captions={() => captions}
        selectedCaption={() => captions[0]}
        onSelect={vi.fn()}
      />
    ));
    expect(screen.getByRole("listbox", { name: "Top Captions" })).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Lisa");
    expect(options[0]).toHaveTextContent("(8 Likes)");
  });

  it("shows the initials for an author with no avatar, and the image for another (#202)", () => {
    const noAvatar = {
      ...makeCaption(3, "demo1", 2),
      author: { id: 3, name: "demo1", avatarUrl: trustedUrl("") },
    };
    render(() => (
      <TopCaptionsCard
        captions={() => [captions[0], noAvatar]}
        selectedCaption={() => captions[0]}
        onSelect={vi.fn()}
      />
    ));
    const [withImage, withInitials] = screen.getAllByRole("option");
    expect(within(withInitials).getByTestId("caption-author-initials")).toHaveTextContent(/^DE$/);
    expect(within(withInitials).queryAllByRole("presentation")).toHaveLength(0);
    expect(within(withImage).queryByTestId("caption-author-initials")).not.toBeInTheDocument();
    // The avatar has `alt=""` (the name is next to it), so it is a presentation image.
    expect(within(withImage).getByRole("presentation")).toHaveAttribute(
      "src",
      "https://example.com/Lisa.png",
    );
  });

  it("marks the selected caption's row as selected", () => {
    render(() => (
      <TopCaptionsCard
        captions={() => captions}
        selectedCaption={() => captions[1]}
        onSelect={vi.fn()}
      />
    ));
    const options = screen.getAllByRole("option");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect with the clicked caption's id (not its index)", () => {
    const onSelect = vi.fn();
    render(() => (
      <TopCaptionsCard
        captions={() => captions}
        selectedCaption={() => captions[0]}
        onSelect={onSelect}
      />
    ));
    screen.getAllByRole("option")[1].click();
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("selects by id via the keyboard (roving listbox, #33-a)", () => {
    const [selectedId, setSelectedId] = createSignal(1);
    render(() => (
      <TopCaptionsCard
        captions={() => captions}
        selectedCaption={() => captions.find((c) => c.id === selectedId())}
        onSelect={setSelectedId}
      />
    ));
    const listbox = screen.getByRole("listbox", { name: "Top Captions" });
    listbox.focus();
    listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(selectedId()).toBe(2);
  });

  it("renders no options before the captions resource resolves", () => {
    render(() => (
      <TopCaptionsCard
        captions={() => undefined}
        selectedCaption={() => undefined}
        onSelect={vi.fn()}
      />
    ));
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});
