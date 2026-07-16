import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { render, screen, within, waitFor } from "@solidjs/testing-library";
import { MetaProvider } from "@solidjs/meta";
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
    expect(within(photos).getAllByRole("option")).toHaveLength(2);

    // Row 0 is "All"; row 1 is Landscape — only "Brilliant tree" is tagged with it.
    within(categories).getAllByRole("option")[1].click();

    await waitFor(() => expect(within(photos).getAllByRole("option")).toHaveLength(1));
    expect(within(photos).getByRole("option")).toHaveTextContent("Homer");
    expect(await screen.findByRole("heading", { name: /brilliant tree/i })).toBeInTheDocument();
  });

  it("shows every post again under the 'All' category row (#33-b)", async () => {
    renderJedi();
    const categories = await screen.findByRole("listbox", { name: "Categories" });
    const photos = await screen.findByRole("listbox", { name: "Top Photos" });

    within(categories).getAllByRole("option")[1].click(); // Landscape
    await waitFor(() => expect(within(photos).getAllByRole("option")).toHaveLength(1));
    within(categories).getAllByRole("option")[0].click(); // All
    await waitFor(() => expect(within(photos).getAllByRole("option")).toHaveLength(2));
  });
});
