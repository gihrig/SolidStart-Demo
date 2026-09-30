import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { JediApi } from "~/lib/jedi/jedi-api";
import type { CaptionView } from "~/types/jedi";
import PostCaption, { type PostCaptionProps } from "./PostCaption";

const CAPTION: CaptionView = {
  id: 1,
  postId: 1,
  author: { id: 1, name: "Lisa", avatarUrl: trustedUrl("") },
  text: "Jedi Kitty protects the street",
  likeCount: 8,
};

const captionAddMock = vi.fn<JediApi["captions"]["add"]>();
const api = { captions: { add: captionAddMock } };
const onClose = vi.fn();

beforeEach(() => {
  captionAddMock.mockReset();
  onClose.mockReset();
});

const defaults: PostCaptionProps = {
  postId: 1,
  caption: CAPTION,
  captionsLoaded: true,
  canAdd: true,
  adding: false,
  onClose,
  api,
};
const renderCaption = (props: Partial<PostCaptionProps> = {}) => {
  const user = userEvent.setup();
  // Merge in plain JS: a JSX spread (`mergeProps`) skips `undefined`, so
  // `caption: undefined` would not override the default caption.
  const merged = { ...defaults, ...props };
  render(() => <PostCaption {...merged} />);
  return { user };
};
const input = () => screen.queryByLabelText("Your caption");

describe("<PostCaption />", () => {
  it("shows the caption when the form is not open", () => {
    renderCaption();
    expect(screen.getByText(CAPTION.text)).toBeInTheDocument();
    expect(input()).toBeNull();
  });

  it("never shows the form to an anonymous visitor", () => {
    renderCaption({ canAdd: false, adding: true, caption: undefined });
    expect(input()).toBeNull();
  });

  it("swaps the caption for the focused form while adding, with Cancel", async () => {
    const { user } = renderCaption({ adding: true });
    expect(screen.queryByText(CAPTION.text)).toBeNull();
    expect(input()).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose once the back-end commits the new Caption", async () => {
    captionAddMock.mockResolvedValue({ ...CAPTION, id: 99, text: "A new contender" });
    const { user } = renderCaption({ adding: true });

    await user.type(input()!, "A new contender");
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    expect(captionAddMock).toHaveBeenCalledWith(1, "A new contender");
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("an earlier Post's submit does not close the form opened on the next Post (#185 review)", async () => {
    let resolve!: (c: CaptionView) => void;
    captionAddMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const [postId, setPostId] = createSignal(1);
    const user = userEvent.setup();
    render(() => <PostCaption {...defaults} adding postId={postId()} />);

    // Submit on Post 1, then move to Post 2 while the add is in flight.
    await user.type(input()!, "for post one");
    await user.click(screen.getByRole("button", { name: "Add Caption" }));
    setPostId(2);
    resolve({ ...CAPTION, id: 99, text: "for post one" });
    await new Promise((r) => setTimeout(r, 0));

    // Post 2's form stays open: the stale submit reports nothing.
    expect(onClose).not.toHaveBeenCalled();
    expect(input()).toBeInTheDocument();
  });

  it("shows the form, without Cancel or focus, when a logged-in User sees a Post with no caption", () => {
    renderCaption({ caption: undefined });
    expect(input()).toBeInTheDocument();
    expect(input()).not.toHaveFocus();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("shows no form while the Post's captions are loading", () => {
    renderCaption({ caption: undefined, captionsLoaded: false });
    expect(input()).toBeNull();
  });
});
