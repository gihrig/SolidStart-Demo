import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import { trustedUrl } from "~/lib/sanitizeUrl";
import OwnerActions from "./OwnerActions";
import type { AuthorRef } from "~/types/jedi";

const lisa: AuthorRef = { id: 1, name: "Lisa", avatarUrl: trustedUrl("") };
const buttons = () => screen.queryAllByRole("button").map((b) => b.getAttribute("aria-label"));

describe("<OwnerActions />", () => {
  it("shows Edit and Delete, labelled by noun and author, to the Owner", () => {
    render(() => <OwnerActions noun="caption" author={lisa} userId={1} />);
    expect(buttons()).toEqual(["Edit caption by Lisa", "Delete caption by Lisa"]);
  });

  it("shows nothing to another User", () => {
    render(() => <OwnerActions noun="Post" author={lisa} userId={2} />);
    expect(buttons()).toEqual([]);
  });

  it("shows nothing until the User's id loads", () => {
    render(() => <OwnerActions noun="Post" author={lisa} />);
    expect(buttons()).toEqual([]);
  });
});
