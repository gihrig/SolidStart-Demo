import { describe, it, expect, vi, beforeAll } from "vite-plus/test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { stubDialogModal } from "~/lib/test-utils";
import { trustedUrl } from "~/lib/sanitizeUrl";
import OwnerActions from "./OwnerActions";
import type { AuthorRef } from "~/types/jedi";

beforeAll(stubDialogModal);

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

  describe("the delete question (#187)", () => {
    const T1 = "Delete this Post? Its Captions, Comments and Likes are deleted too.";
    const T3 = "Your unsaved changes will be discarded.";
    const dialog = () => screen.queryByRole("dialog") as HTMLDialogElement | null;

    function renderOwner(discardsDraft = false) {
      const onDelete = vi.fn();
      render(() => (
        <OwnerActions
          loggedIn
          noun="Post"
          author={lisa}
          userId={1}
          deleteQuestion={T1}
          deleteDiscardsDraft={() => discardsDraft}
          onDelete={onDelete}
        />
      ));
      return onDelete;
    }

    it("asks first, and Delete calls onDelete", async () => {
      const user = userEvent.setup();
      const onDelete = renderOwner();
      await user.click(screen.getByRole("button", { name: "Delete Post by Lisa" }));
      expect(onDelete).not.toHaveBeenCalled();
      expect(dialog()?.open).toBe(true);
      expect(dialog()).toHaveAccessibleName(T1);

      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(onDelete).toHaveBeenCalledOnce();
      expect(dialog()).toBeNull();
    });

    it("adds the Draft warning when the delete discards a Draft", async () => {
      const user = userEvent.setup();
      renderOwner(true);
      await user.click(screen.getByRole("button", { name: "Delete Post by Lisa" }));
      expect(dialog()).toHaveAccessibleName(`${T1} ${T3}`);
    });

    it("Cancel is the default, and Cancel and Escape do not delete", async () => {
      const user = userEvent.setup();
      const onDelete = renderOwner();
      const deleteButton = screen.getByRole("button", { name: "Delete Post by Lisa" });
      await user.click(deleteButton);
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(dialog()).toBeNull();
      expect(deleteButton, "focus returns to Delete").toHaveFocus();

      await user.click(deleteButton);
      fireEvent(dialog()!, new Event("cancel", { cancelable: true }));
      expect(dialog()).toBeNull();
      expect(onDelete).not.toHaveBeenCalled();
    });
  });
});
