import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen, waitFor, within, fireEvent } from "@solidjs/testing-library";
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

const composeBox = () => screen.getByRole("textbox", { name: "Post Comment" });
// Each form has its own Cancel (#210): the compose box's and the edit's.
const cancelOf = (box: HTMLElement) =>
  within(box.closest("form")!).getByRole("button", { name: "Cancel" });
const composeCancel = () => cancelOf(composeBox());
const editCancel = () => cancelOf(screen.getByRole("textbox", { name: "Edit your comment" }));

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
    render(() => <CommentThread id="t" thread={thread} composeLabel="Post Comment" />);
    const [second, first] = screen.getAllByRole("listitem");
    expect(second.querySelector("strong")).toHaveTextContent("second");
    expect(first).toHaveTextContent("first");
  });

  it("passes each body through the backstop before it injects the HTML (#126)", () => {
    const { thread } = fakeThread([
      comment(1, 1, '<img src="https://x.example/y.png"><a href="ftp://x.example/">a</a>'),
    ]);
    render(() => <CommentThread id="t" thread={thread} composeLabel="Post Comment" />);
    const item = screen.getByRole("listitem");
    expect(item.querySelector("img")).toBeNull();
    expect(item.querySelector("a")).not.toHaveAttribute("href");
  });

  it("says when the thread loads, and when it is empty", () => {
    const { thread, setComments } = fakeThread(undefined);
    render(() => <CommentThread id="t" thread={thread} composeLabel="Post Comment" />);
    expect(screen.getByText("Loading Comments…")).toBeInTheDocument();
    setComments([]);
    expect(screen.getByText("No Comments yet")).toBeInTheDocument();
  });

  it("shows a thread load error as an alert", () => {
    const { thread, setError } = fakeThread([]);
    render(() => <CommentThread id="t" thread={thread} composeLabel="Post Comment" />);
    setError("Could not load the Comments");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the Comments");
  });

  it("offers no compose box and no Edit / Delete to a visitor", () => {
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    render(() => <CommentThread id="t" thread={thread} composeLabel="Post Comment" />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /edit|delete/i })).toBeNull();
  });

  it("takes the compose box's heading from its owner (#210)", () => {
    const { thread } = fakeThread([]);
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Caption Comment" loggedIn userId={2} />
    ));
    expect(screen.getByRole("textbox", { name: "Caption Comment" })).toBeInTheDocument();
  });

  it("posts a Comment, then clears the compose box", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([]);
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));

    await user.type(composeBox(), "hello");
    await user.click(screen.getByRole("button", { name: "Add Comment" }));

    expect(thread.add).toHaveBeenCalledWith("hello");
    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(composeBox()).toHaveValue("");
  });

  it("keeps the compose box text when the post fails, and shows the error", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([]);
    vi.mocked(thread.add).mockRejectedValueOnce(new Error("Network down"));
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));

    await user.type(composeBox(), "hello");
    await user.click(screen.getByRole("button", { name: "Add Comment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
    expect(composeBox()).toHaveValue("hello");
  });

  it('says "Could not add the Comment" when the add fails with no message (#210)', async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([]);
    vi.mocked(thread.add).mockRejectedValueOnce({ status: 500 });
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));

    await user.type(composeBox(), "hello");
    await user.click(screen.getByRole("button", { name: "Add Comment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not add the Comment");
  });

  it('the submit reads "Adding…" while it writes (#210)', async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([]);
    let finish!: () => void;
    vi.mocked(thread.add).mockReturnValueOnce(new Promise<void>((r) => (finish = r)));
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));

    await user.type(composeBox(), "hello");
    await user.click(screen.getByRole("button", { name: "Add Comment" }));
    expect(screen.getByRole("button", { name: "Adding…" })).toBeDisabled();

    finish();
    expect(await screen.findByRole("button", { name: "Add Comment" })).toBeInTheDocument();
  });

  it("keeps the compose box text when the thread changes (a live Event or a reload)", async () => {
    const user = userEvent.setup();
    const { thread, setComments } = fakeThread([comment(1, 3, "first")]);
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));

    await user.type(composeBox(), "draft");
    setComments([comment(1, 3, "first"), comment(2, 3, "pushed")]);

    expect(composeBox()).toHaveValue("draft");
  });

  it("counts toward the 2000 cap, and blocks an empty or over-cap post", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([]);
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));
    const post = screen.getByRole("button", { name: "Add Comment" });

    expect(screen.getByText("0/2000")).toBeInTheDocument();
    expect(post).toBeDisabled();

    await user.click(composeBox());
    await user.paste("a".repeat(2001));
    expect(screen.getByText("2001/2000")).toBeInTheDocument();
    expect(post).toBeDisabled();
  });

  it("offers Edit / Delete only on the viewer's own Comments", () => {
    const { thread } = fakeThread([comment(1, 2, "mine"), comment(2, 3, "theirs")]);
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));
    const [mine, theirs] = screen.getAllByRole("listitem");
    expect(within(mine).getByRole("button", { name: "Edit comment" })).toBeInTheDocument();
    expect(within(mine).getByRole("button", { name: "Delete comment" })).toBeInTheDocument();
    expect(within(theirs).queryByRole("button")).toBeNull();
  });

  it("edits the viewer's own Comment in place", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));

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
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));

    await user.click(screen.getByRole("button", { name: "Edit comment" }));
    await user.click(editCancel());

    expect(thread.update).not.toHaveBeenCalled();
    expect(screen.getByText("mine")).toBeInTheDocument();
  });

  it("deletes the viewer's own Comment", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));

    await user.click(screen.getByRole("button", { name: "Delete comment" }));

    expect(thread.remove).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByText("mine")).toBeNull());
  });

  it("shows a failed delete as an alert on that Comment", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    vi.mocked(thread.remove).mockRejectedValueOnce(new Error("Network down"));
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));

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
    render(() => <CommentThread id="t" thread={thread} composeLabel="Post Comment" />);
    const item = screen.getByRole("listitem");

    expect(within(item).getByTestId("comment-initials")).toHaveTextContent(/^US$/);
    expect(within(item).getByText("user2")).toBeInTheDocument();
    // HTML allows at most 3 decimal places; the wire can carry 6.
    expect(item.querySelector("time")).toHaveAttribute("datetime", "2026-10-11T09:14:05.123Z");
  });

  it("shows the avatar image, with an empty alt text: the name is next to it", () => {
    const avatar = { id: 2, name: "Lisa", avatarUrl: trustedUrl("https://example.com/lisa.png") };
    const { thread } = fakeThread([comment(1, 2, "hi", { author: avatar })]);
    render(() => <CommentThread id="t" thread={thread} composeLabel="Post Comment" />);
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
    render(() => <CommentThread id="t" thread={thread} composeLabel="Post Comment" />);
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
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));
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
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));
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
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));

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
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));

    await user.click(screen.getByRole("button", { name: "Edit comment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
    expect(screen.getByRole("textbox", { name: "Edit your comment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("an edit whose reload fails disables Save until a later reload succeeds (#126)", async () => {
    const user = userEvent.setup();
    const { thread, setComments } = fakeThread([comment(1, 2, "mine")]);
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));
    const editBox = await openEdit(user);
    await user.type(editBox, "!");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();

    // A remote edit moves the row's `mtime`, and its reload fails.
    vi.mocked(thread.source).mockRejectedValueOnce(new Error("Network down"));
    setComments([comment(1, 2, "theirs", { mtime: "2026-10-10T12:05:00Z" })]);

    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
    expect(save, "a save would overwrite the unseen remote edit").toBeDisabled();
    expect(editCancel()).toBeEnabled();
    expect(editBox, "the user keeps the text").toHaveValue("mine!");

    // The next `mtime` move loads the text again.
    setComments([comment(1, 2, "theirs again", { mtime: "2026-10-10T12:06:00Z" })]);
    await waitFor(() => expect(save).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(editBox).toHaveValue("mine!");
  });

  it("puts the compose box above the list", () => {
    const { thread } = fakeThread([comment(1, 3, "first")]);
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));

    const position = composeBox().compareDocumentPosition(screen.getByRole("list"));
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // The test setup loads no CSS, so the classes stand for the size: the body's
  // `.comment-body` rule and the textarea's `text-base` (#245).
  it("the body and the compose and edit text fields use the larger Comment text (#245)", async () => {
    const user = userEvent.setup();
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));

    expect(screen.getByText("mine").closest(".comment-body")).not.toBeNull();
    expect(composeBox()).toHaveClass("text-base");
    expect(await openEdit(user)).toHaveClass("text-base");
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
          <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
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
    guard.attempt(() => {}, [thread.draftScope]);
    expect(guard.pending(), "the Draft is in the panel's scope").toBe(true);
    guard.cancelMove();

    await user.click(screen.getByRole("button", { name: "Add Comment" }));
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
    await user.click(editCancel());
    expect(guard.pending(), "Cancel asks first (#214)").toBe(true);
    guard.confirmMove();
    expect(guard.hasDraft(), "Discard discards it").toBe(false);
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
});

describe("<CommentThread /> — Cancel, Escape and focus (#214)", () => {
  function renderGuarded(thread: CommentThreadState, onClosePanel?: () => void) {
    const guard = createDraftGuard();
    render(() => (
      <DraftGuardContext.Provider value={guard}>
        <CommentThread
          id="t"
          thread={thread}
          composeLabel="Post Comment"
          onClosePanel={onClosePanel}
          loggedIn
          userId={2}
        />
      </DraftGuardContext.Provider>
    ));
    return { guard, user: userEvent.setup() };
  }
  const editBox = () => screen.queryByRole("textbox", { name: "Edit your comment" });
  const editButton = () => screen.getByRole("button", { name: "Edit comment" });

  it("the edit's Cancel and Escape with a Draft ask; Keep editing keeps the text", async () => {
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    const { guard, user } = renderGuarded(thread);
    await user.type(await openEdit(user), "!");

    await user.click(editCancel());
    expect(guard.pending()).toBe(true);
    guard.cancelMove();
    expect(editBox()).toHaveValue("mine!");

    await user.click(editBox()!);
    await user.keyboard("{Escape}");
    expect(guard.pending()).toBe(true);
    guard.confirmMove();
    expect(editBox()).toBeNull();
  });

  it("the compose Cancel is disabled while the box is empty, and while it writes (#210)", async () => {
    const { thread } = fakeThread([]);
    let finish!: () => void;
    vi.mocked(thread.add).mockReturnValueOnce(new Promise<void>((r) => (finish = r)));
    const { user } = renderGuarded(thread);
    expect(composeCancel()).toBeDisabled();

    await user.type(composeBox(), "hello");
    expect(composeCancel()).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Add Comment" }));
    expect(composeCancel(), "while it writes").toBeDisabled();

    finish();
    await waitFor(() => expect(composeBox()).toHaveValue(""));
    expect(composeCancel()).toBeDisabled();
  });

  it("the compose Cancel with a Draft asks; Keep editing keeps the text, Discard empties the box (#210)", async () => {
    const { thread } = fakeThread([]);
    const { guard, user } = renderGuarded(thread);
    await user.type(composeBox(), "hello");

    await user.click(composeCancel());
    expect(guard.pending()).toBe(true);
    guard.cancelMove();
    expect(composeBox()).toHaveValue("hello");

    await user.click(composeCancel());
    guard.confirmMove();
    expect(composeBox()).toHaveValue("");
    expect(guard.hasDraft()).toBe(false);
  });

  it("the compose Cancel empties a box of only spaces at once (#210)", async () => {
    const { thread } = fakeThread([]);
    const { guard, user } = renderGuarded(thread);
    await user.type(composeBox(), "   ");

    await user.click(composeCancel());
    expect(guard.pending()).toBe(false);
    expect(composeBox()).toHaveValue("");
  });

  it("focus moves to the text field after a compose Cancel, and after Discard (#210)", async () => {
    const { thread } = fakeThread([]);
    const { guard, user } = renderGuarded(thread);
    await user.type(composeBox(), "   ");
    await user.click(composeCancel());
    expect(composeBox()).toHaveFocus();

    await user.type(composeBox(), "hello");
    await user.click(composeCancel());
    guard.confirmMove();
    expect(composeBox()).toHaveFocus();
  });

  it("Escape runs the compose Cancel, and a document Escape listener does not get it (#210)", async () => {
    const onDocumentKey = vi.fn();
    document.addEventListener("keydown", onDocumentKey);
    try {
      const { thread } = fakeThread([]);
      const { guard, user } = renderGuarded(thread);
      await user.type(composeBox(), "compose");
      await user.keyboard("{Escape}");
      expect(guard.pending(), "with a Draft, it asks").toBe(true);
      guard.confirmMove();
      expect(composeBox()).toHaveValue("");

      await user.type(composeBox(), "   ");
      await user.keyboard("{Escape}");
      expect(composeBox(), "without a Draft, it empties the box at once").toHaveValue("");
      expect(onDocumentKey).not.toHaveBeenCalledWith(expect.objectContaining({ key: "Escape" }));
    } finally {
      document.removeEventListener("keydown", onDocumentKey);
    }
  });

  it("Escape in the empty compose box closes the panel, as the toggle does (#210)", async () => {
    const { thread } = fakeThread([]);
    const onClosePanel = vi.fn();
    const { user } = renderGuarded(thread, onClosePanel);
    await user.type(composeBox(), "   ");
    await user.keyboard("{Escape}");
    expect(onClosePanel, "a box with text runs its Cancel").not.toHaveBeenCalled();
    expect(composeBox()).toHaveValue("");

    // The browser's own Escape action stays canceled: the close can ask.
    expect(fireEvent.keyDown(composeBox(), { key: "Escape" })).toBe(false);
    expect(onClosePanel).toHaveBeenCalledOnce();
  });

  it("focus returns to the Comment's Edit button after a Cancel, an Escape and a Save", async () => {
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    const { user } = renderGuarded(thread);

    await openEdit(user);
    await user.click(editCancel());
    expect(editButton()).toHaveFocus();

    await user.click(await openEdit(user));
    await user.keyboard("{Escape}");
    expect(editButton()).toHaveFocus();

    await user.type(await openEdit(user), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(editBox()).toBeNull());
    expect(editButton()).toHaveFocus();
  });

  it("focus returns to the Edit button after Discard", async () => {
    const { thread } = fakeThread([comment(1, 2, "mine")]);
    const { guard, user } = renderGuarded(thread);
    await user.type(await openEdit(user), "!");
    await user.click(editCancel());
    guard.confirmMove();
    expect(editButton()).toHaveFocus();
  });
});

describe("<CommentThread /> — Enter submits (#246)", () => {
  function renderThread(initial: CommentView[] = []) {
    const { thread } = fakeThread(initial);
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));
    return { thread, user: userEvent.setup() };
  }

  it("a plain Enter in the compose box adds the Comment, and the box clears", async () => {
    const { thread, user } = renderThread();
    await user.type(composeBox(), "hello{Enter}");

    expect(thread.add).toHaveBeenCalledWith("hello");
    await waitFor(() => expect(composeBox()).toHaveValue(""));
  });

  it("a plain Enter in an edit with changes saves, and the edit closes", async () => {
    const { thread, user } = renderThread([comment(1, 2, "mine")]);
    await user.type(await openEdit(user), "!{Enter}");

    expect(thread.update).toHaveBeenCalledWith(1, "mine!");
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Edit your comment" })).toBeNull(),
    );
  });

  it("Shift+Enter adds a new line, and no submit occurs", async () => {
    const { thread, user } = renderThread();
    await user.type(composeBox(), "one{Shift>}{Enter}{/Shift}two");

    expect(composeBox()).toHaveValue("one\ntwo");
    expect(thread.add).not.toHaveBeenCalled();
  });

  // Safari can send the Enter that confirms a composed character with
  // `isComposing` false and `keyCode` 229 (WebKit bug 165004).
  it.each([
    ["isComposing", { isComposing: true }],
    ["keyCode 229", { isComposing: false, keyCode: 229 }],
  ])("an IME Enter (%s) does not submit, and keeps its default", async (_, init) => {
    const { thread, user } = renderThread();
    await user.type(composeBox(), "hello");

    expect(fireEvent.keyDown(composeBox(), { key: "Enter", ...init })).toBe(true);
    expect(thread.add).not.toHaveBeenCalled();
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Cmd", { metaKey: true }],
    ["Alt", { altKey: true }],
  ])("%s+Enter does not submit, and keeps its default", async (_, init) => {
    const { thread, user } = renderThread();
    await user.type(composeBox(), "hello");

    expect(fireEvent.keyDown(composeBox(), { key: "Enter", ...init })).toBe(true);
    expect(thread.add).not.toHaveBeenCalled();
  });

  it("a plain Enter on a button does not submit: the button keeps its own action", async () => {
    const { thread, user } = renderThread();
    await user.type(composeBox(), "hello");

    expect(fireEvent.keyDown(composeCancel(), { key: "Enter" })).toBe(true);
    expect(thread.add).not.toHaveBeenCalled();
  });

  it("with a touch pointer, Enter adds a new line, and does not submit", async () => {
    const fine = window.matchMedia;
    const coarse = vi.fn((query: string) =>
      Object.assign(fine(query), { matches: query === "(pointer: coarse)" }),
    );
    vi.stubGlobal("matchMedia", coarse);
    try {
      const { thread, user } = renderThread();
      await user.type(composeBox(), "hello");

      expect(fireEvent.keyDown(composeBox(), { key: "Enter" })).toBe(true);
      expect(thread.add).not.toHaveBeenCalled();
      expect(coarse).toHaveBeenCalledWith("(pointer: coarse)");
      expect(screen.queryByText(/Shift\+Enter/), "no hint").toBeNull();
      expect(composeBox()).toHaveAttribute("aria-describedby", "t-compose-count");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("the hint names the Enter rule of each form, and describes its text field", async () => {
    const { user } = renderThread([comment(1, 2, "mine")]);
    expect(composeBox()).toHaveAccessibleDescription(
      "Enter = add Comment. Shift+Enter = new line. 0/2000",
    );

    const editBox = await openEdit(user);
    expect(editBox).toHaveAttribute(
      "aria-describedby",
      "t-comment-1-edit-hint t-comment-1-edit-count",
    );
    expect(editBox).toHaveAccessibleDescription("Enter = save. Shift+Enter = new line. 4/2000");
  });

  it("the Enter rule and the hint follow a change of the pointer, until the form unmounts", async () => {
    // A pointer query whose `change` a test fires, as a hybrid device does.
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    const pointer = { matches: false };
    const fine = window.matchMedia;
    vi.stubGlobal("matchMedia", (query: string) =>
      Object.assign(fine(query), {
        get matches() {
          return query === "(pointer: coarse)" && pointer.matches;
        },
        addEventListener: (_: "change", l: (e: MediaQueryListEvent) => void) => listeners.add(l),
        removeEventListener: (_: "change", l: (e: MediaQueryListEvent) => void) =>
          listeners.delete(l),
      }),
    );
    const change = (coarse: boolean) => {
      pointer.matches = coarse;
      for (const l of listeners) l({ matches: coarse } as MediaQueryListEvent);
    };
    try {
      const { thread } = fakeThread([]);
      const { unmount } = render(() => (
        <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
      ));
      const user = userEvent.setup();
      await user.type(composeBox(), "hello");
      const hint = () => screen.queryByText(/Shift\+Enter/);
      expect(hint()).toBeInTheDocument();

      change(true);
      expect(hint(), "a touch pointer: no hint").toBeNull();
      expect(composeBox()).toHaveAttribute("aria-describedby", "t-compose-count");
      expect(fireEvent.keyDown(composeBox(), { key: "Enter" })).toBe(true);
      expect(thread.add).not.toHaveBeenCalled();

      change(false);
      expect(hint(), "a fine pointer again").toBeInTheDocument();
      expect(fireEvent.keyDown(composeBox(), { key: "Enter" })).toBe(false);
      expect(thread.add).toHaveBeenCalledWith("hello");

      unmount();
      expect(listeners.size, "the form stops listening").toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a plain Enter in a blank compose box does nothing, and adds no new line", async () => {
    const { thread, user } = renderThread();
    await user.type(composeBox(), "   ");

    expect(fireEvent.keyDown(composeBox(), { key: "Enter" })).toBe(false);
    expect(thread.add).not.toHaveBeenCalled();
    expect(composeBox()).toHaveValue("   ");
  });

  it("a plain Enter over the cap does nothing", async () => {
    const { thread, user } = renderThread();
    await user.click(composeBox());
    await user.paste("a".repeat(2001));

    expect(fireEvent.keyDown(composeBox(), { key: "Enter" })).toBe(false);
    expect(thread.add).not.toHaveBeenCalled();
  });

  it("a plain Enter in an unchanged edit does nothing", async () => {
    const { thread, user } = renderThread([comment(1, 2, "mine")]);
    const editBox = await openEdit(user);

    expect(fireEvent.keyDown(editBox, { key: "Enter" })).toBe(false);
    expect(thread.update).not.toHaveBeenCalled();
    expect(editBox).toBeInTheDocument();
  });

  it("a plain Enter while the compose box writes does nothing", async () => {
    const { thread, user } = renderThread();
    let finish!: () => void;
    vi.mocked(thread.add).mockReturnValueOnce(new Promise<void>((r) => (finish = r)));
    await user.type(composeBox(), "hello{Enter}");
    expect(screen.getByRole("button", { name: "Adding…" })).toBeDisabled();

    expect(fireEvent.keyDown(composeBox(), { key: "Enter" })).toBe(false);
    expect(thread.add).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(composeBox()).toHaveValue(""));
  });

  it("a plain Enter in an edit whose reload failed does nothing", async () => {
    const { thread, setComments } = fakeThread([comment(1, 2, "mine")]);
    render(() => (
      <CommentThread id="t" thread={thread} composeLabel="Post Comment" loggedIn userId={2} />
    ));
    const user = userEvent.setup();
    const editBox = await openEdit(user);
    await user.type(editBox, "!");
    vi.mocked(thread.source).mockRejectedValueOnce(new Error("Network down"));
    setComments([comment(1, 2, "theirs", { mtime: "2026-10-10T12:05:00Z" })]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");

    expect(fireEvent.keyDown(editBox, { key: "Enter" })).toBe(false);
    expect(thread.update).not.toHaveBeenCalled();
  });
});
