import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { createDraftGuard, type DraftGuard } from "~/lib/createDraftGuard";
import type { CommentThreadState } from "~/lib/jedi/createCommentThread";
import { trustedUrl } from "~/lib/sanitizeUrl";
import type { CommentView } from "~/types/jedi";
import CommentThread from "./CommentThread";
import { DraftGuardContext } from "./DraftGuardContext";

// A Comment by User `authorId`, whose stored text is `text`: its author is its
// Owner. The fake render wraps the text in a `<p>`, unescaped, so a test can
// pass HTML through it. It has no avatar image and no edit, unless `extra`
// says so.
const comment = (
  id: number,
  authorId: number,
  text: string,
  extra: Partial<CommentView> = {},
): CommentView => ({
  id,
  parentId: 1,
  author: { id: authorId, name: `user${authorId}`, avatarUrl: trustedUrl("") },
  contentHtml: `<p>${text}</p>`,
  ctime: "2026-10-10T12:00:00Z",
  mtime: "2026-10-10T12:00:00Z",
  ...extra,
});

// One second after `time`: the `mtime` of an edit.
const later = (time: string) => new Date(Date.parse(time) + 1000).toISOString();

// An in-memory thread: the writes change the rows, as `createCommentThread`
// does once the back-end commits. Each call is a spy a test can fail. The rows
// reconcile by id, as the real thread's do, so a changed row keeps its DOM.
// `source` reads a row's stored text, as `get_post_comment` does (#126): the
// fake undoes the fake render.
function fakeThread(initial: CommentView[] | undefined) {
  const [state, setState] = createStore<{ rows?: CommentView[] }>({ rows: initial });
  const setComments = (rows: CommentView[] | undefined) =>
    setState("rows", rows && state.rows ? reconcile(rows, { key: "id" }) : rows);
  const [error, setError] = createSignal<string>();
  let nextId = 100;
  const thread: CommentThreadState = {
    open: () => true,
    setOpen: () => {},
    draftScope: Symbol("post-comments"),
    comments: () => state.rows,
    deleted: (id) => state.rows !== undefined && state.rows.every((c) => c.id !== id),
    error,
    add: vi.fn(async (content: string) => {
      setComments([comment(nextId++, 2, content), ...(state.rows ?? [])]);
    }),
    update: vi.fn(async (id: number, content: string) => {
      setComments(
        state.rows?.map((c) =>
          c.id === id ? { ...c, contentHtml: `<p>${content}</p>`, mtime: later(c.mtime) } : c,
        ),
      );
    }),
    source: vi.fn(async (id: number) => {
      const row = state.rows?.find((c) => c.id === id);
      if (!row) throw new Error("Comment not found");
      return row.contentHtml.replace(/^<p>|<\/p>$/g, "");
    }),
    remove: vi.fn(async (id: number) => {
      setComments(state.rows?.filter((c) => c.id !== id));
    }),
  };
  return { thread, setComments, setError };
}

const composeBox = () => screen.getByRole("textbox", { name: "Your comment" });

// Open the edit of the viewer's own Comment, and wait for its stored text.
async function openEdit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Edit comment" }));
  const editBox = screen.getByRole("textbox", { name: "Edit your comment" });
  await waitFor(() => expect(editBox).toBeEnabled());
  return editBox;
}

describe("<CommentThread />", () => {
  it("lists the Comments in the thread's order, each body as HTML (#126)", () => {
    const { thread } = fakeThread([
      comment(2, 3, "<strong>second</strong>"),
      comment(1, 1, "first"),
    ]);
    render(() => <CommentThread id="t" thread={thread} />);
    const [second, first] = screen.getAllByRole("listitem");
    expect(second.querySelector("strong")).toHaveTextContent("second");
    expect(first).toHaveTextContent("first");
  });

  it("passes each body through the backstop before it injects the HTML (#126)", () => {
    const { thread } = fakeThread([
      comment(1, 1, '<img src="https://x.example/y.png"><a href="ftp://x.example/">a</a>'),
    ]);
    render(() => <CommentThread id="t" thread={thread} />);
    const item = screen.getByRole("listitem");
    expect(item.querySelector("img")).toBeNull();
    expect(item.querySelector("a")).not.toHaveAttribute("href");
  });

  it("says when the thread loads, and when it is empty", () => {
    const { thread, setComments } = fakeThread(undefined);
    render(() => <CommentThread id="t" thread={thread} />);
    expect(screen.getByText("Loading Comments…")).toBeInTheDocument();
    setComments([]);
    expect(screen.getByText("No Comments yet")).toBeInTheDocument();
  });

  it("shows a thread load error as an alert", () => {
    const { thread, setError } = fakeThread([]);
    render(() => <CommentThread id="t" thread={thread} />);
    setError("Could not load the Comments");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the Comments");
  });

  it("offers no compose box and no Edit / Delete to a visitor", () => {
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    render(() => <CommentThread id="t" thread={thread} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /edit|delete/i })).toBeNull();
  });

  it("posts a Comment, then clears the compose box", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([]);
    render(() => <CommentThread id="t" thread={thread} loggedIn userId={2} />);

    await user.type(composeBox(), "hello");
    await user.click(screen.getByRole("button", { name: "Post Comment" }));

    expect(thread.add).toHaveBeenCalledWith("hello");
    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(composeBox()).toHaveValue("");
  });

  it("keeps the compose box text when the post fails, and shows the error", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([]);
    vi.mocked(thread.add).mockRejectedValueOnce(new Error("Network down"));
    render(() => <CommentThread id="t" thread={thread} loggedIn userId={2} />);

    await user.type(composeBox(), "hello");
    await user.click(screen.getByRole("button", { name: "Post Comment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
    expect(composeBox()).toHaveValue("hello");
  });

  it("keeps the compose box text when the thread changes (a live Event or a reload)", async () => {
    const user = userEvent.setup();
    const { thread, setComments } = fakeThread([comment(1, 3, "first")]);
    render(() => <CommentThread id="t" thread={thread} loggedIn userId={2} />);

    await user.type(composeBox(), "draft");
    setComments([comment(1, 3, "first"), comment(2, 3, "pushed")]);

    expect(composeBox()).toHaveValue("draft");
  });

  it("counts toward the 2000 cap, and blocks an empty or over-cap post", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([]);
    render(() => <CommentThread id="t" thread={thread} loggedIn userId={2} />);
    const post = screen.getByRole("button", { name: "Post Comment" });

    expect(screen.getByText("0/2000")).toBeInTheDocument();
    expect(post).toBeDisabled();

    await user.click(composeBox());
    await user.paste("a".repeat(2001));
    expect(screen.getByText("2001/2000")).toBeInTheDocument();
    expect(post).toBeDisabled();
  });

  it("offers Edit / Delete only on the viewer's own Comments", () => {
    const { thread } = fakeThread([comment(1, 2, "mine"), comment(2, 3, "theirs")]);
    render(() => <CommentThread id="t" thread={thread} loggedIn userId={2} />);
    const [mine, theirs] = screen.getAllByRole("listitem");
    expect(within(mine).getByRole("button", { name: "Edit comment" })).toBeInTheDocument();
    expect(within(mine).getByRole("button", { name: "Delete comment" })).toBeInTheDocument();
    expect(within(theirs).queryByRole("button")).toBeNull();
  });

  it("edits the viewer's own Comment in place", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    render(() => <CommentThread id="t" thread={thread} loggedIn userId={2} />);

    const editBox = await openEdit(user);
    expect(editBox).toHaveValue("mine");
    await user.clear(editBox);
    await user.type(editBox, "mine, edited");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(thread.update).toHaveBeenCalledWith(1, "mine, edited");
    expect(await screen.findByText("mine, edited")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Edit your comment" })).toBeNull();
  });

  it("cancels an edit without saving", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    render(() => <CommentThread id="t" thread={thread} loggedIn userId={2} />);

    await user.click(screen.getByRole("button", { name: "Edit comment" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(thread.update).not.toHaveBeenCalled();
    expect(screen.getByText("mine")).toBeInTheDocument();
  });

  it("deletes the viewer's own Comment", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    render(() => <CommentThread id="t" thread={thread} loggedIn userId={2} />);

    await user.click(screen.getByRole("button", { name: "Delete comment" }));

    expect(thread.remove).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByText("mine")).toBeNull());
  });

  it("shows a failed delete as an alert on that Comment", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    vi.mocked(thread.remove).mockRejectedValueOnce(new Error("Network down"));
    render(() => <CommentThread id="t" thread={thread} loggedIn userId={2} />);

    await user.click(screen.getByRole("button", { name: "Delete comment" }));

    const item = screen.getByRole("listitem");
    expect(await within(item).findByRole("alert")).toHaveTextContent("Network down");
  });
});

describe("<CommentThread /> — the Comment row (#125)", () => {
  it("shows the author's initials, the name and the time", () => {
    const { thread } = fakeThread([
      comment(1, 2, "hi", {
        ctime: "2026-10-11T09:14:05.123456Z",
        mtime: "2026-10-11T09:14:05.123456Z",
      }),
    ]);
    render(() => <CommentThread id="t" thread={thread} />);
    const item = screen.getByRole("listitem");

    expect(within(item).getByTestId("comment-initials")).toHaveTextContent(/^US$/);
    expect(within(item).getByText("user2")).toBeInTheDocument();
    // HTML allows at most 3 decimal places; the wire can carry 6.
    expect(item.querySelector("time")).toHaveAttribute("datetime", "2026-10-11T09:14:05.123Z");
  });

  it("shows the avatar image, with an empty alt text: the name is next to it", () => {
    const avatar = { id: 2, name: "Lisa", avatarUrl: trustedUrl("https://example.com/lisa.png") };
    const { thread } = fakeThread([comment(1, 2, "hi", { author: avatar })]);
    render(() => <CommentThread id="t" thread={thread} />);
    const item = screen.getByRole("listitem");

    const img = item.querySelector("img");
    expect(img).toHaveAttribute("src", "https://example.com/lisa.png");
    expect(img).toHaveAttribute("alt", "");
    expect(within(item).queryByTestId("comment-initials")).toBeNull();
  });

  it('shows "(edited)" only when mtime differs from ctime, with the edit time as its tooltip', () => {
    const { thread } = fakeThread([
      comment(2, 2, "edited", { mtime: "2026-10-10T12:05:00Z" }),
      comment(1, 2, "unedited"),
    ]);
    render(() => <CommentThread id="t" thread={thread} />);
    const [edited, unedited] = screen.getAllByRole("listitem");

    expect(within(edited).getByText("(edited)")).toHaveAttribute(
      "title",
      expect.stringMatching(/^Edited /),
    );
    expect(within(unedited).queryByText("(edited)")).toBeNull();
  });

  it("an open edit keeps the name line and replaces only the body; the buttons hide", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    render(() => <CommentThread id="t" thread={thread} loggedIn userId={2} />);
    const item = screen.getByRole("listitem");

    const editBox = await openEdit(user);

    expect(within(item).getByText("user2")).toBeInTheDocument();
    expect(item.querySelector("time")).not.toBeNull();
    expect(within(item).getByRole("textbox", { name: "Edit your comment" })).toBe(editBox);
    expect(editBox).toHaveValue("mine");
    expect(within(item).queryByText("mine")).toBeNull();
    expect(within(item).queryByRole("button", { name: /comment$/ })).toBeNull();
  });

  it("disables Save while an edit holds no Draft", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    render(() => <CommentThread id="t" thread={thread} loggedIn userId={2} />);
    const editBox = await openEdit(user);
    const save = screen.getByRole("button", { name: "Save" });

    expect(save, "no change yet").toBeDisabled();
    await user.type(editBox, "!");
    expect(save).toBeEnabled();
    await user.type(editBox, "{Backspace}");
    expect(save, "back to the saved text").toBeDisabled();
  });

  it('an edit is disabled with "Loading…" until its stored text arrives (#126)', async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    let resolve!: (text: string) => void;
    vi.mocked(thread.source).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(() => <CommentThread id="t" thread={thread} loggedIn userId={2} />);

    await user.click(screen.getByRole("button", { name: "Edit comment" }));
    const editBox = screen.getByRole("textbox", { name: "Edit your comment" });

    expect(thread.source).toHaveBeenCalledWith(1);
    expect(editBox).toBeDisabled();
    expect(editBox).toHaveAttribute("placeholder", "Loading…");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    resolve("**mine**");
    await waitFor(() => expect(editBox).toBeEnabled());
    expect(editBox).toHaveValue("**mine**");
    expect(editBox).not.toHaveAttribute("placeholder");
  });

  it("an edit whose stored text fails to load shows the alert, and Save stays disabled", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    vi.mocked(thread.source).mockRejectedValueOnce(new Error("Network down"));
    render(() => <CommentThread id="t" thread={thread} loggedIn userId={2} />);

    await user.click(screen.getByRole("button", { name: "Edit comment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
    expect(screen.getByRole("textbox", { name: "Edit your comment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("an edit whose reload fails disables Save until a later reload succeeds (#126)", async () => {
    const user = userEvent.setup();
    const { thread, setComments } = fakeThread([comment(1, 2, "mine")]);
    render(() => <CommentThread id="t" thread={thread} loggedIn userId={2} />);
    const editBox = await openEdit(user);
    await user.type(editBox, "!");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();

    // A remote edit moves the row's `mtime`, and its reload fails.
    vi.mocked(thread.source).mockRejectedValueOnce(new Error("Network down"));
    setComments([comment(1, 2, "theirs", { mtime: "2026-10-10T12:05:00Z" })]);

    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
    expect(save, "a save would overwrite the unseen remote edit").toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(editBox, "the user keeps the text").toHaveValue("mine!");

    // The next `mtime` move loads the text again.
    setComments([comment(1, 2, "theirs again", { mtime: "2026-10-10T12:06:00Z" })]);
    await waitFor(() => expect(save).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(editBox).toHaveValue("mine!");
  });

  it("puts the compose box above the list", () => {
    const { thread } = fakeThread([comment(1, 3, "first")]);
    render(() => <CommentThread id="t" thread={thread} loggedIn userId={2} />);

    const position = composeBox().compareDocumentPosition(screen.getByRole("list"));
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("<CommentThread /> — Drafts (ADR-0030)", () => {
  // The thread inside its own guard, so a test can read what each form reports.
  function renderGuarded(thread: CommentThreadState) {
    let guard!: DraftGuard;
    const result = render(() => {
      guard = createDraftGuard();
      return (
        <DraftGuardContext.Provider value={guard}>
          <CommentThread id="t" thread={thread} loggedIn userId={2} />
        </DraftGuardContext.Provider>
      );
    });
    return { guard, ...result };
  }

  it("the compose box reports a Draft while its text is not blank", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([]);
    const { guard } = renderGuarded(thread);

    await user.type(composeBox(), "   ");
    expect(guard.hasDraft(), "blank after a trim").toBe(false);
    await user.type(composeBox(), "hello");
    expect(guard.hasDraft()).toBe(true);
    guard.attempt(() => {}, thread.draftScope);
    expect(guard.pending(), "the Draft is in the panel's scope").toBe(true);
    guard.cancelMove();

    await user.click(screen.getByRole("button", { name: "Post Comment" }));
    await waitFor(() => expect(composeBox()).toHaveValue(""));
    expect(guard.hasDraft(), "a saved Comment is no Draft").toBe(false);
  });

  it("an edit reports a Draft while its text differs from the saved Comment", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    const { guard } = renderGuarded(thread);

    const editBox = await openEdit(user);
    expect(guard.hasDraft()).toBe(false);
    await user.type(editBox, "!");
    expect(guard.hasDraft()).toBe(true);
    await user.type(editBox, "{Backspace}");
    expect(guard.hasDraft(), "back to the saved text").toBe(false);

    await user.type(editBox, "!");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(guard.hasDraft(), "Cancel discards it").toBe(false);
    expect(guard.notice()).toBeUndefined();
  });

  it("a remote edit of the saved Comment updates the edit's Draft", async () => {
    const user = userEvent.setup();
    const { thread, setComments } = fakeThread([comment(1, 2, "mine")]);
    const { guard } = renderGuarded(thread);
    const editBox = await openEdit(user);
    await user.type(editBox, "!");
    expect(guard.hasDraft()).toBe(true);

    // The Owner saves other text in another tab: the row's `mtime` moves.
    setComments([comment(1, 2, "theirs", { mtime: "2026-10-10T12:05:00Z" })]);
    await waitFor(() => expect(thread.source).toHaveBeenCalledTimes(2));
    expect(editBox, "a changed edit keeps the user's text").toHaveValue("mine!");
    expect(guard.hasDraft()).toBe(true);

    // The Owner saves the same text in another tab.
    setComments([comment(1, 2, "mine!", { mtime: "2026-10-10T12:06:00Z" })]);
    await waitFor(() =>
      expect(guard.hasDraft(), "the text now equals the saved Comment").toBe(false),
    );
    expect(editBox).toHaveValue("mine!");
  });

  it("an unchanged edit shows a remote edit's text, and holds no Draft", async () => {
    const user = userEvent.setup();
    const { thread, setComments } = fakeThread([comment(1, 2, "mine")]);
    const { guard } = renderGuarded(thread);
    const editBox = await openEdit(user);

    setComments([comment(1, 2, "edited elsewhere", { mtime: "2026-10-10T12:05:00Z" })]);

    await waitFor(() => expect(editBox).toHaveValue("edited elsewhere"));
    expect(guard.hasDraft()).toBe(false);
  });

  it("an edit holds no Draft until its stored text loads (#126)", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    let resolve!: (text: string) => void;
    vi.mocked(thread.source).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { guard } = renderGuarded(thread);

    await user.click(screen.getByRole("button", { name: "Edit comment" }));
    expect(guard.hasDraft()).toBe(false);
    resolve("mine");

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Edit your comment" })).toHaveValue("mine"),
    );
    expect(guard.hasDraft()).toBe(false);
  });

  it("a Comment deleted under an edit with a Draft shows the forced-discard notice", async () => {
    const user = userEvent.setup();
    const { thread, setComments } = fakeThread([comment(1, 2, "mine")]);
    const { guard } = renderGuarded(thread);
    await user.type(await openEdit(user), "!");

    // The Owner deletes it in another tab: the removal Event drops the row.
    setComments([]);

    expect(guard.hasDraft()).toBe(false);
    expect(guard.notice()).toBe("This Comment was deleted. Your unsaved changes were discarded.");
  });

  it("a form that unmounts with no Draft shows no notice", async () => {
    const user = userEvent.setup();
    const { thread, setComments } = fakeThread([comment(1, 2, "mine")]);
    const { guard, unmount } = renderGuarded(thread);
    await user.click(screen.getByRole("button", { name: "Edit comment" }));

    setComments([]);
    unmount();
    expect(guard.notice()).toBeUndefined();
  });
});
