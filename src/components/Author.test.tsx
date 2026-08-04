import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { trustedUrl } from "~/lib/sanitizeUrl";
import Author from "./Author";

describe("<Author />", () => {
  it("renders avatar and name", () => {
    render(() => <Author avatarSrc={trustedUrl("/images/avatar.jpg")} name="Test Author" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/images/avatar.jpg");
    expect(screen.getByText("Test Author")).toBeInTheDocument();
  });

  it("uses custom href when provided", () => {
    render(() => (
      <Author
        avatarSrc={trustedUrl("/images/avatar.jpg")}
        name="Test"
        href={trustedUrl("/author")}
      />
    ));
    expect(screen.getByRole("link")).toHaveAttribute("href", "/author");
  });

  it("renders without link when href not provided", () => {
    render(() => <Author avatarSrc={trustedUrl("/images/avatar.jpg")} name="Test" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("calls onClick handler when link clicked", async () => {
    const handler = vi.fn((e: MouseEvent) => e.preventDefault());
    const user = userEvent.setup();
    render(() => (
      <Author
        avatarSrc={trustedUrl("/images/avatar.jpg")}
        name="Test"
        href={trustedUrl("#")}
        onClick={handler}
      />
    ));
    await user.click(screen.getByRole("link"));
    expect(handler).toHaveBeenCalledOnce();
  });
});
