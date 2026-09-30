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

beforeEach(() => {
  captionAddMock.mockReset();
});

const defaults: PostCaptionProps = {
  postId: 1,
  caption: CAPTION,
  captionsLoaded: true,
  canAdd: true,
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
const addButton = () => screen.queryByRole("button", { name: "Add Caption" });
const input = () => screen.queryByLabelText("Your caption");

describe("<PostCaption />", () => {
  it("shows the caption and no Add Caption button to an anonymous visitor", () => {
    renderCaption({ canAdd: false });
    expect(screen.getByText(CAPTION.text)).toBeInTheDocument();
    expect(addButton()).toBeNull();
    expect(input()).toBeNull();
  });

  it("shows no form to an anonymous visitor when the Post has no caption", () => {
    renderCaption({ canAdd: false, caption: undefined });
    expect(addButton()).toBeNull();
    expect(input()).toBeNull();
  });

  it("shows the caption with an Add Caption button to a logged-in User", () => {
    renderCaption();
    expect(screen.getByText(CAPTION.text)).toBeInTheDocument();
    expect(addButton()).toBeInTheDocument();
    expect(input()).toBeNull();
  });

  it("swaps the caption for the focused form on Add Caption, and back on Cancel", async () => {
    const { user } = renderCaption();

    await user.click(addButton()!);
    expect(screen.queryByText(CAPTION.text)).toBeNull();
    expect(input()).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText(CAPTION.text)).toBeInTheDocument();
    expect(input()).toBeNull();
    expect(addButton()).toHaveFocus();
  });

  it("returns to the caption once the back-end commits the new one", async () => {
    captionAddMock.mockResolvedValue({ ...CAPTION, id: 99, text: "A new contender" });
    const { user } = renderCaption();

    await user.click(addButton()!);
    await user.type(input()!, "A new contender");
    await user.click(screen.getByRole("button", { name: "Add Caption" }));

    expect(captionAddMock).toHaveBeenCalledWith(1, "A new contender");
    await waitFor(() => expect(screen.getByText(CAPTION.text)).toBeInTheDocument());
    expect(input()).toBeNull();
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
    expect(addButton()).toBeNull();
  });

  it("closes an open form when the selected Post changes", async () => {
    const [postId, setPostId] = createSignal(1);
    const user = userEvent.setup();
    render(() => <PostCaption {...defaults} postId={postId()} />);

    await user.click(addButton()!);
    expect(input()).toBeInTheDocument();

    setPostId(2);
    await waitFor(() => expect(input()).toBeNull());
    expect(screen.getByText(CAPTION.text)).toBeInTheDocument();
  });
});
