import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import LikeControl from "./LikeControl";
import type { Like } from "~/types/jedi";

const like: Like = { id: 1, likeCount: 6, liked: true };
const button = () => screen.queryByRole("button", { name: "Like post by Lisa" });
const count = () => screen.getByText("Likes:").parentElement;

describe("<LikeControl />", () => {
  it("shows a visitor only the fire-heart and the fallback count", () => {
    render(() => (
      <LikeControl
        fallbackCount={5}
        countLabel="Likes"
        label="Like post by Lisa"
        onToggle={vi.fn()}
      />
    ));
    expect(count()).toHaveTextContent("Likes: 5");
    expect(button()).toBeNull();
  });

  it("disables Like for a logged-in User while the like state loads", () => {
    render(() => (
      <LikeControl
        loggedIn
        fallbackCount={5}
        countLabel="Likes"
        label="Like post by Lisa"
        onToggle={vi.fn()}
      />
    ));
    expect(button()).toBeDisabled();
    expect(button()).toHaveAttribute("aria-pressed", "false");
  });

  it("shows the viewer's live count and pressed state, and calls onToggle on click", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(() => (
      <LikeControl
        loggedIn
        like={like}
        fallbackCount={5}
        countLabel="Likes"
        label="Like post by Lisa"
        onToggle={onToggle}
      />
    ));
    expect(count()).toHaveTextContent("Likes: 6");
    expect(button()).toHaveAttribute("aria-pressed", "true");
    await user.click(button()!);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
