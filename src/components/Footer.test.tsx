import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import Footer from "./Footer";

// createMemoryHistory() - Creates an in-memory navigation history for testing
// history.set() - Sets the initial path before the router mounts
// MemoryRouter with custom history - Provides the router context
// Route with component={Footer} - Establishes the Route context that useLocation() requires

const renderWithRouter = (path: string = "/") => {
  const history = createMemoryHistory();
  history.set({ value: path, scroll: false, replace: true });

  return render(() => (
    <MemoryRouter history={history}>
      <Route path="*" component={Footer} />
    </MemoryRouter>
  ));
};

describe("<Footer />", () => {
  it("renders navigation with Home, About, ReadMe and FullStack links", () => {
    renderWithRouter();

    const footer = screen.getByRole("contentinfo");
    expect(footer).toBeInTheDocument();

    const homeLink = screen.getByRole("link", { name: "Home" });
    const aboutLink = screen.getByRole("link", { name: "About" });
    const readmeLink = screen.getByRole("link", { name: "ReadMe" });
    const fullstackLink = screen.getByRole("link", { name: "FullStack" });

    expect(homeLink).toHaveAttribute("href", "/");
    expect(aboutLink).toHaveAttribute("href", "/about");
    expect(readmeLink).toHaveAttribute("href", "/readme");
    expect(fullstackLink).toHaveAttribute("href", "/fullstack");
  });

  it("does not render a Jedi link (Jedi is now the home page)", () => {
    renderWithRouter();
    expect(screen.queryByRole("link", { name: "Jedi" })).not.toBeInTheDocument();
  });

  it("applies active styling to Home link when on home path", () => {
    renderWithRouter("/");

    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("border-sky-600");
    expect(screen.getByRole("link", { name: "About" })).toHaveClass("border-transparent");
    expect(screen.getByRole("link", { name: "ReadMe" })).toHaveClass("border-transparent");
    expect(screen.getByRole("link", { name: "FullStack" })).toHaveClass("border-transparent");
  });

  it("applies active styling to About link when on about path", () => {
    renderWithRouter("/about");

    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("border-transparent");
    expect(screen.getByRole("link", { name: "About" })).toHaveClass("border-sky-600");
    expect(screen.getByRole("link", { name: "ReadMe" })).toHaveClass("border-transparent");
    expect(screen.getByRole("link", { name: "FullStack" })).toHaveClass("border-transparent");
  });

  it("applies active styling to ReadMe link when on /readme path", () => {
    renderWithRouter("/readme");

    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("border-transparent");
    expect(screen.getByRole("link", { name: "About" })).toHaveClass("border-transparent");
    expect(screen.getByRole("link", { name: "ReadMe" })).toHaveClass("border-sky-600");
    expect(screen.getByRole("link", { name: "FullStack" })).toHaveClass("border-transparent");
  });

  it("applies active styling to FullStack link when on /fullstack path", () => {
    renderWithRouter("/fullstack");

    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("border-transparent");
    expect(screen.getByRole("link", { name: "About" })).toHaveClass("border-transparent");
    expect(screen.getByRole("link", { name: "ReadMe" })).toHaveClass("border-transparent");
    expect(screen.getByRole("link", { name: "FullStack" })).toHaveClass("border-sky-600");
  });

  it("renders all links as inactive on unknown path", () => {
    renderWithRouter("/unknown");

    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("border-transparent");
    expect(screen.getByRole("link", { name: "About" })).toHaveClass("border-transparent");
    expect(screen.getByRole("link", { name: "ReadMe" })).toHaveClass("border-transparent");
    expect(screen.getByRole("link", { name: "FullStack" })).toHaveClass("border-transparent");
  });
});
