import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import { trustedUrl } from "~/lib/sanitizeUrl";
import Avatar from "./Avatar";

describe("<Avatar />", () => {
  it("shows the image, with its alt text, when there is an avatar", () => {
    render(() => (
      <Avatar src={trustedUrl("/images/avatar.jpg")} name="Lisa" alt="Lisa" data-testid="ini" />
    ));
    expect(screen.getByRole("img")).toHaveAttribute("src", "/images/avatar.jpg");
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Lisa");
    expect(screen.queryByTestId("ini")).not.toBeInTheDocument();
  });

  it("keeps an empty alt text: a decorative image next to the name", () => {
    const { container } = render(() => (
      <Avatar src={trustedUrl("/images/avatar.jpg")} name="Lisa" alt="" />
    ));
    // An `alt=""` image has the presentation role, so query the element.
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("shows the name's initials, and no image, when there is no avatar", () => {
    render(() => <Avatar src={trustedUrl("")} name="demo1" alt="demo1" data-testid="ini" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("ini")).toHaveTextContent(/^DE$/);
  });
});
