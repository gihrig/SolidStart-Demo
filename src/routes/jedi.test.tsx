import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
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
});
