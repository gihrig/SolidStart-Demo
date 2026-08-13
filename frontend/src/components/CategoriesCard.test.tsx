import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import type { JediCategory } from "~/types/jedi";
import CategoriesCard from "./CategoriesCard";

const categories: JediCategory[] = [
  { id: 0, name: "All", icon: "menu" },
  { id: 1, name: "Landscape", icon: "landscape" },
  { id: 3, name: "Animals", icon: "dog" },
];

describe("<CategoriesCard />", () => {
  it("renders every category name as a listbox option", () => {
    render(() => (
      <CategoriesCard categories={() => categories} selectedCategory={() => 0} onSelect={vi.fn()} />
    ));
    expect(screen.getByRole("listbox", { name: "Categories" })).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All",
      "Landscape",
      "Animals",
    ]);
  });

  it("marks the selected category as the selected option", () => {
    render(() => (
      <CategoriesCard categories={() => categories} selectedCategory={() => 2} onSelect={vi.fn()} />
    ));
    const options = screen.getAllByRole("option");
    expect(options[2]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect with the clicked category's index", async () => {
    const onSelect = vi.fn();
    render(() => (
      <CategoriesCard
        categories={() => categories}
        selectedCategory={() => 0}
        onSelect={onSelect}
      />
    ));
    screen.getAllByRole("option")[1].click();
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("moves the selection with the keyboard (roving listbox)", () => {
    const [selected, setSelected] = createSignal(0);
    render(() => (
      <CategoriesCard
        categories={() => categories}
        selectedCategory={selected}
        onSelect={setSelected}
      />
    ));
    const listbox = screen.getByRole("listbox", { name: "Categories" });
    listbox.focus();
    listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(selected()).toBe(1);
  });

  // #38: the focus ring is keyboard-modality only. A pointer click selects the
  // option but must not paint the ring; keyboard focus must.
  const hasRing = (el: Element) => el.className.includes("ring-2");

  it("shows no focus ring on a pointer click", () => {
    render(() => (
      <CategoriesCard categories={() => categories} selectedCategory={() => 0} onSelect={vi.fn()} />
    ));
    const listbox = screen.getByRole("listbox", { name: "Categories" });
    const option = screen.getAllByRole("option")[1];
    // mimic a mouse click: pointerdown, then the listbox focuses, then click
    fireEvent.pointerDown(option);
    fireEvent.focus(listbox);
    fireEvent.click(option);
    expect(screen.getAllByRole("option").some(hasRing)).toBe(false);
    expect(listbox.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("shows the focus ring on keyboard focus and moves it with arrows", () => {
    render(() => (
      <CategoriesCard categories={() => categories} selectedCategory={() => 0} onSelect={vi.fn()} />
    ));
    const listbox = screen.getByRole("listbox", { name: "Categories" });
    fireEvent.focus(listbox); // Tab in — no preceding pointerdown
    expect(hasRing(screen.getAllByRole("option")[0])).toBe(true);
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(hasRing(options[0])).toBe(false);
    expect(hasRing(options[1])).toBe(true);
  });

  it("renders no options before the categories resource resolves", () => {
    render(() => (
      <CategoriesCard categories={() => undefined} selectedCategory={() => 0} onSelect={vi.fn()} />
    ));
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});
