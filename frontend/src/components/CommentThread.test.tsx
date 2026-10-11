import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import type { PostComments } from "~/lib/jedi/createPostComments";
import type { PostComment } from "~/types/jedi";
import CommentThread from "./CommentThread";

const comment = (id: number, ownerId: number, content: string): PostComment => ({
  id,
  postId: 1,
  ownerId,
  content,
});

// An in-memory thread: the writes change the rows, as `createPostComments`
// does once the back-end commits. Each write is a spy a test can fail.
function fakePostComments(initial: PostComment[] | undefined) {
  const [comments, setComments] = createSignal(initial);
  const [error, setError] = createSignal<string>();
  let nextId = 100;
  const postComments: PostComments = {
    open: () => true,
    setOpen: () => {},
    comments,
    error,
    add: vi.fn(async (content: string) => {
      setComments((rows) => [...(rows ?? []), comment(nextId++, 2, content)]);
    }),
    update: vi.fn(async (id: number, content: string) => {
      setComments((rows) => rows?.map((c) => (c.id === id ? { ...c, content } : c)));
    }),
    remove: vi.fn(async (id: number) => {
      setComments((rows) => rows?.filter((c) => c.id !== id));
    }),
  };
  return { postComments, setComments, setError };
}

const composeBox = () => screen.getByRole("textbox", { name: "Your comment" });

describe("<CommentThread />", () => {
  it("lists the Comments, oldest first, as plain text", () => {
    const { postComments } = fakePostComments([
      comment(1, 1, "first"),
      comment(2, 3, "<b>second</b>"),
    ]);
    render(() => <CommentThread id="t" postComments={postComments} />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("first");
    expect(items[1]).toContain("<b>second</b>");
  });

  it("says when the thread loads, and when it is empty", () => {
    const { postComments, setComments } = fakePostComments(undefined);
    render(() => <CommentThread id="t" postComments={postComments} />);
    expect(screen.getByText("Loading Comments…")).toBeInTheDocument();
    setComments([]);
    expect(screen.getByText("No Comments yet")).toBeInTheDocument();
  });

  it("shows a thread load error as an alert", () => {
    const { postComments, setError } = fakePostComments([]);
    render(() => <CommentThread id="t" postComments={postComments} />);
    setError("Could not load the Comments");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the Comments");
  });

  it("offers no compose box and no Edit / Delete to a visitor", () => {
    const { postComments } = fakePostComments([comment(1, 2, "mine")]);
    render(() => <CommentThread id="t" postComments={postComments} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /edit|delete/i })).toBeNull();
  });

  it("posts a Comment, then clears the compose box", async () => {
    const user = userEvent.setup();
    const { postComments } = fakePostComments([]);
    render(() => <CommentThread id="t" postComments={postComments} loggedIn userId={2} />);

    await user.type(composeBox(), "hello");
    await user.click(screen.getByRole("button", { name: "Post Comment" }));

    expect(postComments.add).toHaveBeenCalledWith("hello");
    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(composeBox()).toHaveValue("");
  });

  it("keeps the compose box text when the post fails, and shows the error", async () => {
    const user = userEvent.setup();
    const { postComments } = fakePostComments([]);
    vi.mocked(postComments.add).mockRejectedValueOnce(new Error("Network down"));
    render(() => <CommentThread id="t" postComments={postComments} loggedIn userId={2} />);

    await user.type(composeBox(), "hello");
    await user.click(screen.getByRole("button", { name: "Post Comment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
    expect(composeBox()).toHaveValue("hello");
  });

  it("keeps the compose box text when the thread changes (a live Event or a reload)", async () => {
    const user = userEvent.setup();
    const { postComments, setComments } = fakePostComments([comment(1, 3, "first")]);
    render(() => <CommentThread id="t" postComments={postComments} loggedIn userId={2} />);

    await user.type(composeBox(), "draft");
    setComments([comment(1, 3, "first"), comment(2, 3, "pushed")]);

    expect(composeBox()).toHaveValue("draft");
  });

  it("counts toward the 2000 cap, and blocks an empty or over-cap post", async () => {
    const user = userEvent.setup();
    const { postComments } = fakePostComments([]);
    render(() => <CommentThread id="t" postComments={postComments} loggedIn userId={2} />);
    const post = screen.getByRole("button", { name: "Post Comment" });

    expect(screen.getByText("0/2000")).toBeInTheDocument();
    expect(post).toBeDisabled();

    await user.click(composeBox());
    await user.paste("a".repeat(2001));
    expect(screen.getByText("2001/2000")).toBeInTheDocument();
    expect(post).toBeDisabled();
  });

  it("offers Edit / Delete only on the viewer's own Comments", () => {
    const { postComments } = fakePostComments([comment(1, 2, "mine"), comment(2, 3, "theirs")]);
    render(() => <CommentThread id="t" postComments={postComments} loggedIn userId={2} />);
    const [mine, theirs] = screen.getAllByRole("listitem");
    expect(within(mine).getByRole("button", { name: "Edit comment" })).toBeInTheDocument();
    expect(within(mine).getByRole("button", { name: "Delete comment" })).toBeInTheDocument();
    expect(within(theirs).queryByRole("button")).toBeNull();
  });

  it("edits the viewer's own Comment in place", async () => {
    const user = userEvent.setup();
    const { postComments } = fakePostComments([comment(1, 2, "mine")]);
    render(() => <CommentThread id="t" postComments={postComments} loggedIn userId={2} />);

    await user.click(screen.getByRole("button", { name: "Edit comment" }));
    const editBox = screen.getByRole("textbox", { name: "Edit your comment" });
    expect(editBox).toHaveValue("mine");
    await user.clear(editBox);
    await user.type(editBox, "mine, edited");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(postComments.update).toHaveBeenCalledWith(1, "mine, edited");
    expect(await screen.findByText("mine, edited")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Edit your comment" })).toBeNull();
  });

  it("cancels an edit without saving", async () => {
    const user = userEvent.setup();
    const { postComments } = fakePostComments([comment(1, 2, "mine")]);
    render(() => <CommentThread id="t" postComments={postComments} loggedIn userId={2} />);

    await user.click(screen.getByRole("button", { name: "Edit comment" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(postComments.update).not.toHaveBeenCalled();
    expect(screen.getByText("mine")).toBeInTheDocument();
  });

  it("deletes the viewer's own Comment", async () => {
    const user = userEvent.setup();
    const { postComments } = fakePostComments([comment(1, 2, "mine")]);
    render(() => <CommentThread id="t" postComments={postComments} loggedIn userId={2} />);

    await user.click(screen.getByRole("button", { name: "Delete comment" }));

    expect(postComments.remove).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByText("mine")).toBeNull());
  });

  it("shows a failed delete as an alert on that Comment", async () => {
    const user = userEvent.setup();
    const { postComments } = fakePostComments([comment(1, 2, "mine")]);
    vi.mocked(postComments.remove).mockRejectedValueOnce(new Error("Network down"));
    render(() => <CommentThread id="t" postComments={postComments} loggedIn userId={2} />);

    await user.click(screen.getByRole("button", { name: "Delete comment" }));

    const item = screen.getByRole("listitem");
    expect(await within(item).findByRole("alert")).toHaveTextContent("Network down");
  });
});
