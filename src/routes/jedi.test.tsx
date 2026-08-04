import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { render, screen, within, waitFor, fireEvent } from "@solidjs/testing-library";
import { MetaProvider } from "@solidjs/meta";
import { Suspense } from "solid-js";
import Jedi from "./jedi";

function setupMatchMedia(mobile: boolean) {
  const mql = { matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
}

const renderJedi = () =>
  render(() => (
    <MetaProvider>
      <Jedi />
    </MetaProvider>
  ));

describe("Jedi route (data-driven from jedi-api)", () => {
  beforeEach(() => setupMatchMedia(false)); // desktop
  afterEach(() => vi.restoreAllMocks());

  it("renders the featured post from the mock", async () => {
    renderJedi();
    expect(await screen.findByRole("heading", { name: /little jedi/i })).toBeInTheDocument();
    expect(await screen.findByText(/jedi kitty protects the street/i)).toBeInTheDocument();
  });

  it("renders the featured post's category chips (tags == categories)", async () => {
    renderJedi();
    expect(await screen.findByRole("button", { name: /^Animals$/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^Cute$/ })).toBeInTheDocument();
  });

  // RED driver: Cute must now appear as a sidebar Category row *and* an article chip.
  it("adds 'Cute' as a sidebar Category (not only an article chip)", async () => {
    renderJedi();
    await screen.findByRole("heading", { name: /little jedi/i }); // wait for load
    const cute = await screen.findAllByText("Cute");
    expect(cute.length).toBeGreaterThanOrEqual(2);
  });

  it("renders Top Photos and Top Captions from the mock", async () => {
    renderJedi();
    expect(await screen.findByText(/\(8 Likes\)/)).toBeInTheDocument();
    expect(await screen.findByText(/\(4 Likes\)/)).toBeInTheDocument();
  });

  it("renders the externalized hero content from the mock", async () => {
    renderJedi();
    expect(
      await screen.findByRole("heading", { name: /awesome photos & captions/i }),
    ).toBeInTheDocument();
  });

  it("renders the externalized nav profile from the mock", async () => {
    renderJedi();
    expect(await screen.findByText("Bart")).toBeInTheDocument();
    expect(await screen.findByAltText("Bart avatar")).toBeInTheDocument();
  });

  it("shows a selected Top Caption under the post in <main> (#33)", async () => {
    renderJedi();
    // Defaults to the winning caption of the featured post.
    expect(await screen.findByText(/jedi kitty protects the street/i)).toBeInTheDocument();

    const captions = await screen.findByRole("listbox", { name: "Top Captions" });
    within(captions).getAllByRole("option")[1].click(); // Bart's, 5 likes

    expect(await screen.findByText(/may the paws be with you/i)).toBeInTheDocument();
    expect(screen.queryByText(/jedi kitty protects the street/i)).not.toBeInTheDocument();
  });

  it("filters Top Photos by the selected Category, moving <main> with it (#33-b)", async () => {
    renderJedi();
    const categories = await screen.findByRole("listbox", { name: "Categories" });
    const photos = await screen.findByRole("listbox", { name: "Top Photos" });
    expect(within(photos).getAllByRole("option")).toHaveLength(4);

    // Row 0 is "All"; row 1 is Landscape — "Brilliant tree" and "Serine Beach" are tagged with it.
    within(categories).getAllByRole("option")[1].click();

    await waitFor(() => expect(within(photos).getAllByRole("option")).toHaveLength(2));
    // Both Landscape posts are Homer's.
    for (const opt of within(photos).getAllByRole("option")) {
      expect(opt).toHaveTextContent("Homer");
    }
    expect(await screen.findByRole("heading", { name: /brilliant tree/i })).toBeInTheDocument();
  });

  it("shows every post again under the 'All' category row (#33-b)", async () => {
    renderJedi();
    const categories = await screen.findByRole("listbox", { name: "Categories" });
    const photos = await screen.findByRole("listbox", { name: "Top Photos" });

    within(categories).getAllByRole("option")[1].click(); // Landscape
    await waitFor(() => expect(within(photos).getAllByRole("option")).toHaveLength(2));
    within(categories).getAllByRole("option")[0].click(); // All
    await waitFor(() => expect(within(photos).getAllByRole("option")).toHaveLength(4));
  });

  it("shows a 'No Posts in <category>' panel in <main> for an empty category", async () => {
    renderJedi();
    const categories = await screen.findByRole("listbox", { name: "Categories" });
    await screen.findByRole("heading", { name: /little jedi/i }); // wait for load

    // Row 2 is "People" — no post is tagged with it.
    within(categories).getAllByRole("option")[2].click();

    const main = screen.getByRole("main");
    await waitFor(() => expect(within(main).getByText(/no posts in people/i)).toBeInTheDocument());
    // The previously-shown featured post is gone, not left stale in <main>.
    expect(within(main).queryByRole("heading", { name: /little jedi/i })).not.toBeInTheDocument();
  });

  // #35 regression: selecting a category that changes both the Top Photos list
  // and the <main> post (Landscape) re-keys the caption resource. Reading it via
  // a suspending call re-triggered Suspense, reconciling the route subtree and
  // blurring the focused listbox <ul> to <body> — a keyboard user was dumped to
  // the page top. The route is wrapped in <Suspense> here to mirror SolidStart's
  // route boundary, where that reconcile happened. Focus must stay on the list.
  it("keeps keyboard focus on the listbox when a category re-keys the captions (#35)", async () => {
    render(() => (
      <MetaProvider>
        <Suspense>
          <Jedi />
        </Suspense>
      </MetaProvider>
    ));

    const categories = await screen.findByRole("listbox", { name: "Categories" });
    await screen.findByRole("heading", { name: /little jedi/i }); // fully loaded

    categories.focus();
    expect(document.activeElement).toBe(categories);

    // ArrowDown: All (0) → Landscape (1); Enter actions it. Landscape drops the
    // featured post from the filter, so <main> and Top Photos both change.
    fireEvent.keyDown(categories, { key: "ArrowDown" });
    fireEvent.keyDown(categories, { key: "Enter" });

    await screen.findByRole("heading", { name: /brilliant tree/i }); // filter applied

    // The whole point: focus did not fall to <body>...
    expect(document.activeElement).toBe(categories);
    // ...and the roving position (Landscape, index 1) is preserved, so keyboard
    // navigation continues from where it was (spec: keep aria-activedescendant).
    expect(categories.getAttribute("aria-activedescendant")).toBe("category-option-1");
  });

  // #37 regression: `useListbox` owns the highlight, returning it as a `classList`
  // via `getOptionProps` that each card spreads onto its option `<li>`, alongside a
  // static `class`. `class` writes the whole className, so it must be applied before
  // the spread — the card lists it first. If it were ordered after, its write would
  // wipe the freshly-toggled highlight on a row's first paint; only a later classList
  // update would re-apply it, so a default (winning/top-ranked) selection that never
  // gets a follow-up update would render with no highlight.
  const isHighlighted = (el: Element) => el.className.includes("bg-(--theme-highlight)");

  it("highlights the default selection on all three cards at load (#37)", async () => {
    renderJedi();
    await screen.findByRole("heading", { name: /little jedi/i }); // loaded

    for (const name of ["Categories", "Top Photos", "Top Captions"]) {
      const list = await screen.findByRole("listbox", { name });
      const rows = within(list).getAllByRole("option");
      // Exactly the default row (index 0: "All" / top-ranked / winning) is highlighted.
      expect(rows.filter(isHighlighted)).toEqual([rows[0]]);
    }
  });

  it("keeps the effective selection highlighted after a Category change (#37)", async () => {
    renderJedi();
    const categories = await screen.findByRole("listbox", { name: "Categories" });
    await screen.findByRole("heading", { name: /little jedi/i });

    within(categories).getAllByRole("option")[1].click(); // Landscape — re-filters + re-keys
    await screen.findByRole("heading", { name: /brilliant tree/i });

    // Top Photos re-filters; its effective (aria-selected) selected row is highlighted.
    await waitFor(() => {
      const photos = within(screen.getByRole("listbox", { name: "Top Photos" })).getAllByRole(
        "option",
      );
      const current = photos.filter((r) => r.getAttribute("aria-selected") === "true");
      expect(current).toEqual(photos.filter(isHighlighted));
      expect(current).toHaveLength(1);
    });

    // Top Captions re-keys off the new post; the winning caption stays highlighted
    // and remains so after the refetch settles.
    await waitFor(() => {
      const captions = within(screen.getByRole("listbox", { name: "Top Captions" })).getAllByRole(
        "option",
      );
      const current = captions.filter((r) => r.getAttribute("aria-selected") === "true");
      expect(current).toEqual(captions.filter(isHighlighted));
      expect(current).toHaveLength(1);
    });
  });

  it("moves the highlight to a directly-selected Top Caption (#37 no-regression)", async () => {
    renderJedi();
    const captions = await screen.findByRole("listbox", { name: "Top Captions" });
    await screen.findByRole("heading", { name: /little jedi/i });

    const rows = within(captions).getAllByRole("option");
    rows[1].click(); // pick a non-default caption

    await waitFor(() => {
      const current = within(captions).getAllByRole("option").filter(isHighlighted);
      expect(current).toEqual([rows[1]]);
    });
  });

  // #38: the active-option focus ring is keyboard-modality only. Each card owns
  // its own listbox; clicking options across cards must never leave rings behind,
  // since a pointer click carries no keyboard focus.
  const hasRing = (el: Element) => el.className.includes("ring-2");

  it("paints no focus ring when clicking options across two cards (#38)", async () => {
    renderJedi();
    const categories = await screen.findByRole("listbox", { name: "Categories" });
    const captions = await screen.findByRole("listbox", { name: "Top Captions" });
    await screen.findByRole("heading", { name: /little jedi/i }); // loaded

    within(categories).getAllByRole("option")[0].click(); // click a Category
    within(captions).getAllByRole("option")[1].click(); // then a Caption

    await waitFor(() => {
      const rings = screen.getAllByRole("option").filter(hasRing);
      expect(rings).toHaveLength(0);
    });
    // Neither listbox advertises an active descendant without keyboard focus.
    expect(categories.getAttribute("aria-activedescendant")).toBeNull();
    expect(
      screen.getByRole("listbox", { name: "Top Captions" }).getAttribute("aria-activedescendant"),
    ).toBeNull();
  });

  it("mirrors the empty message in Top Photos and clears Top Captions", async () => {
    renderJedi();
    const categories = await screen.findByRole("listbox", { name: "Categories" });
    await screen.findByRole("listbox", { name: "Top Photos" }); // loaded

    within(categories).getAllByRole("option")[2].click(); // People — empty

    const photosCard = screen.getByRole("heading", { name: "Top Photos" }).closest("section")!;
    await waitFor(() =>
      expect(within(photosCard).getByText(/no posts in people/i)).toBeInTheDocument(),
    );
    // Top Photos is no longer a listbox while empty.
    expect(within(photosCard).queryByRole("listbox")).not.toBeInTheDocument();

    // Top Captions clears — no caption rows for a category with no photo.
    const captionsCard = screen.getByRole("heading", { name: "Top Captions" }).closest("section")!;
    expect(within(captionsCard).queryAllByRole("option")).toHaveLength(0);
  });
});
