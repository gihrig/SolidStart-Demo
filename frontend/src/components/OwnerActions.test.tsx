import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import { trustedUrl } from "~/lib/sanitizeUrl";
import OwnerActions from "./OwnerActions";
import type { AuthorRef } from "~/types/jedi";

const lisa: AuthorRef = { id: 1, name: "Lisa", avatarUrl: trustedUrl("") };
const buttons = () =>
  screen
    .queryAllByRole("button")
    .map((b) => [b.getAttribute("aria-label"), !b.hasAttribute("disabled")]);

describe("<OwnerActions />", () => {
  it("enables Edit and Delete, labelled by noun and author, for the Owner", () => {
    render(() => <OwnerActions loggedIn noun="caption" author={lisa} userId={1} />);
    expect(buttons()).toEqual([
      ["Edit caption by Lisa", true],
      ["Delete caption by Lisa", true],
    ]);
  });

  it("shows another logged-in User both buttons, disabled", () => {
    render(() => <OwnerActions loggedIn noun="Post" author={lisa} userId={2} />);
    expect(buttons()).toEqual([
      ["Edit Post by Lisa", false],
      ["Delete Post by Lisa", false],
    ]);
  });

  it("keeps both buttons disabled until the User's id loads", () => {
    render(() => <OwnerActions loggedIn noun="Post" author={lisa} />);
    expect(buttons()).toEqual([
      ["Edit Post by Lisa", false],
      ["Delete Post by Lisa", false],
    ]);
  });

  it("disables both buttons when there is nothing to act on (no author)", () => {
    render(() => <OwnerActions loggedIn noun="caption" userId={1} />);
    expect(buttons()).toEqual([
      ["Edit caption", false],
      ["Delete caption", false],
    ]);
  });

  it("shows a visitor who is not logged in nothing", () => {
    render(() => <OwnerActions noun="Post" author={lisa} userId={1} />);
    expect(buttons()).toEqual([]);
  });
});
