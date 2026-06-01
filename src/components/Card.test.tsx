import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import Card from "./Card";

describe("<Card />", () => {
  it("renders children", () => {
    render(() => (
      <Card>
        <div>Test Content</div>
      </Card>
    ));
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("shows title when provided", () => {
    render(() => (
      <Card title="Test Title">
        <div>Content</div>
      </Card>
    ));
    expect(screen.getByRole("heading", { name: "Test Title" })).toBeInTheDocument();
  });

  it("omits title when not provided", () => {
    const { container } = render(() => (
      <Card>
        <div>Content</div>
      </Card>
    ));
    expect(container.querySelector("h2")).toBeNull();
  });

  it("applies custom classes", () => {
    const { container } = render(() => (
      <Card class="custom-class">
        <div>Content</div>
      </Card>
    ));
    expect(container.querySelector("section")).toHaveClass("custom-class");
  });
});
