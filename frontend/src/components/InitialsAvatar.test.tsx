import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import InitialsAvatar from "./InitialsAvatar";

const circle = () => screen.getByTestId("initials");
const renderFor = (name: string) =>
  render(() => <InitialsAvatar name={name} data-testid="initials" />);

describe("<InitialsAvatar />", () => {
  it("shows the name's first two characters, capitalized", () => {
    renderFor("demo1");
    expect(circle()).toHaveTextContent(/^DE$/);
  });

  it("capitalizes an already-capitalized name the same way", () => {
    renderFor("Lisa");
    expect(circle()).toHaveTextContent(/^LI$/);
  });

  it("never cuts an emoji in half (splits by code point)", () => {
    renderFor("😀x1");
    expect(circle()).toHaveTextContent(/^😀X$/);
  });

  it("renders an empty circle for an empty name", () => {
    renderFor("");
    expect(circle()).toHaveTextContent(/^$/);
  });

  it("is hidden from assistive tech: the name is announced beside it", () => {
    renderFor("demo1");
    expect(circle()).toHaveAttribute("aria-hidden", "true");
  });
});
