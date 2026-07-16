import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import type { CaptionView } from "~/types/jedi";
import TopCaptionsCard from "./TopCaptionsCard";

const makeCaption = (id: number, name: string, likeCount: number): CaptionView => ({
  id,
  postId: 1,
  author: { id, name, avatarUrl: `https://example.com/${name}.png` },
  text: `Caption ${id}`,
  likeCount,
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

  it("marks the selected caption's row as current and selected", () => {
    render(() => (
      <TopCaptionsCard
        captions={() => captions}
        selectedCaption={() => captions[1]}
        onSelect={vi.fn()}
      />
    ));
    const options = screen.getAllByRole("option");
    expect(options[1]).toHaveAttribute("aria-current", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).not.toHaveAttribute("aria-current");
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
