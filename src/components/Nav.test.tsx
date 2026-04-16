import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import Nav from "./Nav";

// createMemoryHistory() - Creates an in-memory navigation history for testing
// history.set() - Sets the initial path before the router mounts
// MemoryRouter with custom history - Provides the router context
// Route with component={Nav} - Establishes the Route context that useLocation() requires

const renderWithRouter = (path: string = "/") => {
  const history = createMemoryHistory();
  history.set({ value: path, scroll: false, replace: true });

  return render(() => (
    <MemoryRouter history={history}>
      <Route path="*" component={Nav} />
    </MemoryRouter>
  ));
};

describe("<Nav />", () => {
  it("renders navigation with Home, About, Readme, FullStack and Jedi links", () => {
    renderWithRouter();

    const nav = screen.getByRole("navigation");
    expect(nav).toBeInTheDocument();

    const homeLink = screen.getByRole("link", { name: "Home" });
    const aboutLink = screen.getByRole("link", { name: "About" });
    const readmeLink = screen.getByRole("link", { name: "Readme" });
    const fullstackLink = screen.getByRole("link", { name: "FullStack" });
    const jediLink = screen.getByRole("link", { name: "Jedi" });

    expect(homeLink).toHaveAttribute("href", "/");
    expect(aboutLink).toHaveAttribute("href", "/about");
    expect(readmeLink).toHaveAttribute("href", "/readme");
    expect(fullstackLink).toHaveAttribute("href", "/fullstack");
    expect(jediLink).toHaveAttribute("href", "/jedi");
  });

  it("applies active styling to Home link when on home path", () => {
    renderWithRouter("/");

    const homeLink = screen.getByRole("link", { name: "Home" });
    const aboutLink = screen.getByRole("link", { name: "About" });
    const readmeLink = screen.getByRole("link", { name: "Readme" });
    const fullstackLink = screen.getByRole("link", { name: "FullStack" });
    const jediLink = screen.getByRole("link", { name: "Jedi" });

    // Active link has sky-600 border, inactive has transparent
    expect(homeLink).toHaveClass("border-sky-600");
    expect(aboutLink).toHaveClass("border-transparent");
    expect(readmeLink).toHaveClass("border-transparent");
    expect(fullstackLink).toHaveClass("border-transparent");
    expect(jediLink).toHaveClass("border-transparent");
  });

  it("applies active styling to About link when on about path", () => {
    renderWithRouter("/about");

    const homeLink = screen.getByRole("link", { name: "Home" });
    const aboutLink = screen.getByRole("link", { name: "About" });
    const readmeLink = screen.getByRole("link", { name: "Readme" });
    const fullstackLink = screen.getByRole("link", { name: "FullStack" });
    const jediLink = screen.getByRole("link", { name: "Jedi" });

    expect(homeLink).toHaveClass("border-transparent");
    expect(aboutLink).toHaveClass("border-sky-600");
    expect(readmeLink).toHaveClass("border-transparent");
    expect(fullstackLink).toHaveClass("border-transparent");
    expect(jediLink).toHaveClass("border-transparent");
  });

  it("applies active styling to Readme link when on about path", () => {
    renderWithRouter("/readme");

    const homeLink = screen.getByRole("link", { name: "Home" });
    const aboutLink = screen.getByRole("link", { name: "About" });
    const readmeLink = screen.getByRole("link", { name: "Readme" });
    const fullstackLink = screen.getByRole("link", { name: "FullStack" });
    const jediLink = screen.getByRole("link", { name: "Jedi" });

    expect(homeLink).toHaveClass("border-transparent");
    expect(aboutLink).toHaveClass("border-transparent");
    expect(readmeLink).toHaveClass("border-sky-600");
    expect(fullstackLink).toHaveClass("border-transparent");
    expect(jediLink).toHaveClass("border-transparent");
  });

  it("applies active styling to FullStack link when on /fullstack path", () => {
    renderWithRouter("/fullstack");

    const homeLink = screen.getByRole("link", { name: "Home" });
    const aboutLink = screen.getByRole("link", { name: "About" });
    const readmeLink = screen.getByRole("link", { name: "Readme" });
    const fullstackLink = screen.getByRole("link", { name: "FullStack" });
    const jediLink = screen.getByRole("link", { name: "Jedi" });

    expect(homeLink).toHaveClass("border-transparent");
    expect(aboutLink).toHaveClass("border-transparent");
    expect(readmeLink).toHaveClass("border-transparent");
    expect(fullstackLink).toHaveClass("border-sky-600");
    expect(jediLink).toHaveClass("border-transparent");
  });

  it("applies active styling to Jedi link when on /jedi path", () => {
    renderWithRouter("/jedi");

    const homeLink = screen.getByRole("link", { name: "Home" });
    const aboutLink = screen.getByRole("link", { name: "About" });
    const readmeLink = screen.getByRole("link", { name: "Readme" });
    const fullstackLink = screen.getByRole("link", { name: "FullStack" });
    const jediLink = screen.getByRole("link", { name: "Jedi" });

    expect(homeLink).toHaveClass("border-transparent");
    expect(aboutLink).toHaveClass("border-transparent");
    expect(readmeLink).toHaveClass("border-transparent");
    expect(fullstackLink).toHaveClass("border-transparent");
    expect(jediLink).toHaveClass("border-sky-600");
  });

  it("renders all links as inactive on unknown path", () => {
    renderWithRouter("/unknown");

    const homeLink = screen.getByRole("link", { name: "Home" });
    const aboutLink = screen.getByRole("link", { name: "About" });
    const readmeLink = screen.getByRole("link", { name: "Readme" });
    const fullstackLink = screen.getByRole("link", { name: "FullStack" });
    const jediLink = screen.getByRole("link", { name: "Jedi" });

    expect(homeLink).toHaveClass("border-transparent");
    expect(aboutLink).toHaveClass("border-transparent");
    expect(readmeLink).toHaveClass("border-transparent");
    expect(fullstackLink).toHaveClass("border-transparent");
    expect(jediLink).toHaveClass("border-transparent");
  });
});
