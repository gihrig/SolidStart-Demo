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

  it("puts the image test id on the image, not the initials test id", () => {
    render(() => (
      <Avatar
        src={trustedUrl("/images/avatar.jpg")}
        name="Lisa"
        alt="Lisa"
        data-testid="ini"
        imageTestId="pic"
      />
    ));
    expect(screen.getByTestId("pic")).toBe(screen.getByRole("img"));
    expect(screen.queryByTestId("ini")).not.toBeInTheDocument();
  });

  it("puts no image test id on the initials", () => {
    render(() => (
      <Avatar src={trustedUrl("")} name="demo1" alt="" data-testid="ini" imageTestId="pic" />
    ));
    expect(screen.getByTestId("ini")).toHaveTextContent(/^DE$/);
    expect(screen.queryByTestId("pic")).not.toBeInTheDocument();
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

  it("shows the initials when the avatar is undefined", () => {
    render(() => <Avatar src={undefined} name="demo1" alt="" data-testid="ini" />);
    expect(screen.getByTestId("ini")).toHaveTextContent(/^DE$/);
  });

  it("crops the image to a 32 px circle by default", () => {
    render(() => <Avatar src={trustedUrl("/images/avatar.jpg")} name="Lisa" alt="Lisa" />);
    expect(screen.getByRole("img")).toHaveClass("w-8", "h-8", "rounded-full", "object-cover");
  });

  // jsdom does not calculate layout, so the class is the guard here; the e2e
  // Nav-avatar test checks the real box (#203).
  it("never shrinks in a narrow row, as the image and as the initials", () => {
    render(() => (
      <>
        <Avatar src={trustedUrl("/images/avatar.jpg")} name="Lisa" alt="Lisa" />
        <Avatar src={trustedUrl("")} name="demo1" alt="" data-testid="ini" />
      </>
    ));
    expect(screen.getByRole("img")).toHaveClass("shrink-0");
    expect(screen.getByTestId("ini")).toHaveClass("shrink-0");
  });

  it("is 24 px at size 24, as the image and as the initials", () => {
    render(() => (
      <>
        <Avatar src={trustedUrl("/images/avatar.jpg")} name="Lisa" alt="Lisa" size={24} />
        <Avatar src={trustedUrl("")} name="demo1" alt="" size={24} data-testid="ini" />
      </>
    ));
    expect(screen.getByRole("img")).toHaveClass("w-6", "h-6");
    expect(screen.getByRole("img")).not.toHaveClass("w-8");
    expect(screen.getByTestId("ini")).toHaveClass("w-6", "h-6", "text-xs");
  });
});
