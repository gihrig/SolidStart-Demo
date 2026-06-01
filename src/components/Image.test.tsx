import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import Image from "./Image";

describe("<Image />", () => {
  it("renders image with src and alt", () => {
    render(() => <Image src="/images/test.jpg" alt="Test Image" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/images/test.jpg");
    expect(img).toHaveAttribute("alt", "Test Image");
  });

  it("wraps in link when href provided", () => {
    render(() => <Image src="/images/test.jpg" alt="Test" href="/test" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/test");
  });

  it("does not wrap in link when href omitted", () => {
    const { container } = render(() => <Image src="/images/test.jpg" alt="Test" />);
    expect(container.querySelector("a")).toBeNull();
  });

  it("applies class prop to figure element", () => {
    const { container } = render(() => (
      <Image src="/images/test.jpg" alt="Test" class="custom-class" />
    ));
    expect(container.querySelector("figure")).toHaveClass("custom-class");
  });

  it("applies loading attribute when provided", () => {
    render(() => <Image src="/images/test.jpg" alt="Test" loading="lazy" />);
    expect(screen.getByRole("img")).toHaveAttribute("loading", "lazy");
  });

  it("omits loading attribute when not provided", () => {
    render(() => <Image src="/images/test.jpg" alt="Test" />);
    expect(screen.getByRole("img")).not.toHaveAttribute("loading");
  });
});
