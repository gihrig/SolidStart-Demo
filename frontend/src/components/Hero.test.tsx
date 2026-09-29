import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import { trustedUrl } from "~/lib/sanitizeUrl";
import Hero from "./Hero";

// Hero no longer sanitizes: it receives already-safe URLs (see ADR-0006).
// The seam owns URL rejection — jedi-api.unit.test.ts proves it.
describe("<Hero />", () => {
  it("renders with all props", () => {
    render(() => (
      <Hero
        title="Test Title"
        subtitle="Test Subtitle"
        ctaText="Click Me"
        backgroundImage={trustedUrl("/images/test.jpg")}
      />
    ));
    expect(screen.getByRole("heading")).toHaveTextContent("Test Title");
    expect(screen.getByText("Test Subtitle")).toBeInTheDocument();
    // The CTA target is fixed front-end code, not Hero data (#119).
    expect(screen.getByRole("link", { name: /click me/i })).toHaveAttribute("href", "#");
  });

  it("applies background image style", () => {
    const { container } = render(() => (
      <Hero
        title="T"
        subtitle="T"
        ctaText="T"
        backgroundImage={trustedUrl("/images/test-bg.jpg")}
      />
    ));
    expect(container.querySelector("section")!.style.backgroundImage).toContain(
      "/images/test-bg.jpg",
    );
  });

  it("omits background image style when the URL is empty", () => {
    const { container } = render(() => (
      <Hero title="T" subtitle="T" ctaText="T" backgroundImage={trustedUrl("")} />
    ));
    expect(container.querySelector("section")!.style.backgroundImage).toBe("");
  });
});
