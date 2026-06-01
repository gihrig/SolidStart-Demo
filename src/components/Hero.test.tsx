import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import Hero from "./Hero";

describe("<Hero />", () => {
  it("renders with all props", () => {
    render(() => (
      <Hero
        title="Test Title"
        subtitle="Test Subtitle"
        ctaText="Click Me"
        ctaHref="/test"
        backgroundImage="/images/test.jpg"
      />
    ));
    expect(screen.getByRole("heading")).toHaveTextContent("Test Title");
    expect(screen.getByText("Test Subtitle")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /click me/i })).toHaveAttribute("href", "/test");
  });

  it("applies background image style for safe URLs", () => {
    const { container } = render(() => (
      <Hero title="T" subtitle="T" ctaText="T" ctaHref="#" backgroundImage="/images/test-bg.jpg" />
    ));
    expect(container.querySelector("section")!.style.backgroundImage).toContain(
      "/images/test-bg.jpg",
    );
  });

  it("omits background image for unsafe URLs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = render(() => (
      <Hero title="T" subtitle="T" ctaText="T" ctaHref="#" backgroundImage="javascript:alert(1)" />
    ));
    const style = container.querySelector("section")!.style.backgroundImage;
    expect(style).not.toContain("javascript");
    warn.mockRestore();
  });
});
