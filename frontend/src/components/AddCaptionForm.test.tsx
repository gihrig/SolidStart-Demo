import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { JediApi } from "~/lib/jedi/jedi-api";
import type { CaptionView } from "~/types/jedi";
import AddCaptionForm from "./AddCaptionForm";

const ADDED: CaptionView = {
  id: 99,
  postId: 1,
  author: { id: 1, name: "Lisa", avatarUrl: trustedUrl("") },
  text: "Use the Force, Kitty",
  likeCount: 0,
};

const captionAddMock = vi.fn<JediApi["captions"]["add"]>();
const api = { captions: { add: captionAddMock } };

beforeEach(() => {
  captionAddMock.mockReset();
});

function renderForm() {
  const user = userEvent.setup();
  render(() => <AddCaptionForm postId={1} api={api} />);
  return { user, input: screen.getByLabelText("Your caption") as HTMLInputElement };
}

describe("<AddCaptionForm />", () => {
  it("submits the text for the Post, then clears the input (#121)", async () => {
    captionAddMock.mockResolvedValue(ADDED);
    const { user, input } = renderForm();

    await user.type(input, ADDED.text);
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    expect(captionAddMock).toHaveBeenCalledWith(1, ADDED.text);
    await waitFor(() => expect(input.value).toBe(""));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the back-end rejection and keeps the text", async () => {
    captionAddMock.mockRejectedValue(new Error("text: too long"));
    const { user, input } = renderForm();

    await user.type(input, "rejected");
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("text: too long");
    expect(input.value).toBe("rejected");
  });

  it("caps the input at the back-end limit of 36 characters", () => {
    const { input } = renderForm();
    expect(input.maxLength).toBe(36);
    expect(input.required).toBe(true);
  });

  it("disables the submit while the Caption is in flight", async () => {
    let resolve!: (c: CaptionView) => void;
    captionAddMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const { user, input } = renderForm();

    await user.type(input, ADDED.text);
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    expect(screen.getByRole("button", { name: "Adding…" })).toBeDisabled();
    resolve(ADDED);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Caption" })).toBeEnabled());
  });
});
