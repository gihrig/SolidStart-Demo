import { describe, it, expect, vi, beforeAll, beforeEach } from "vite-plus/test";
import { render, screen, within, waitFor } from "@solidjs/testing-library";
import { A, MemoryRouter, Route } from "@solidjs/router";
import userEvent from "@testing-library/user-event";
import { createResource, createSignal, Show, Suspense, type ParentProps } from "solid-js";
import { trustedUrl } from "~/lib/sanitizeUrl";
import { stubDialogModal } from "~/lib/test-utils";
import type { JediApi } from "~/lib/jedi/jedi-api";
import type { JediCategory, PostView } from "~/types/jedi";
import { AuthProvider, useAuth } from "./AuthContext";
import { DraftGuardProvider } from "./DraftGuardContext";
import { NewPostProvider, useNewPost } from "./NewPostContext";

// AuthProvider's login and logoff go through backend-rpc, mocked so a test can
// log in and hold a logoff open (as in Nav.test).
const { logoffMock } = vi.hoisted(() => ({ logoffMock: vi.fn() }));
vi.mock("~/lib/backend-rpc", () => ({
  backendRpc: {
    auth: { login: vi.fn().mockResolvedValue({ result: "ok" }), logoff: logoffMock },
  },
}));
vi.mock("~/lib/jedi/jedi-api", () => ({
  jediApi: { profile: { get: vi.fn().mockResolvedValue(undefined) } },
}));

beforeAll(stubDialogModal);

const CATEGORIES: JediCategory[] = [{ id: 3, name: "Animals", icon: "dog" }];
const CREATED: PostView = {
  id: 5,
  author: { id: 1, name: "Lisa", avatarUrl: trustedUrl("") },
  title: "New arrival",
  imageSrc: trustedUrl("https://live.staticflickr.com/1/2_b.jpg"),
  imageAlt: "A cat",
  photographer: "Felicity",
  photographerUrl: trustedUrl("https://www.flickr.com/photos/f/"),
  sourceUrl: trustedUrl("https://www.flickr.com/photos/f/2/"),
  categories: CATEGORIES,
  likeCount: 0,
  commentCount: 0,
};

const categoryListMock = vi.fn<JediApi["categories"]["list"]>();
const postCreateMock = vi.fn<JediApi["posts"]["create"]>();
const api = { categories: { list: categoryListMock }, posts: { create: postCreateMock } };

beforeEach(() => {
  categoryListMock.mockReset();
  categoryListMock.mockResolvedValue(CATEGORIES);
  postCreateMock.mockReset();
  logoffMock.mockReset();
  logoffMock.mockResolvedValue({ result: "ok" });
});

// The Slow page loads until a test calls `slowLoaded`.
let slowLoaded!: () => void;
function SlowPage() {
  const [data] = createResource(
    () => new Promise<string>((r) => (slowLoaded = () => r("Slow page"))),
  );
  return <h1>{data()}</h1>;
}

// Two openers, as the Nav's New Post and the Add in the Post actions. The Add
// can leave the page, as the Post actions do.
function renderOpeners() {
  const [addShown, setAddShown] = createSignal(true);
  function Openers() {
    const newPost = useNewPost();
    return (
      <>
        <button type="button" onClick={(e) => newPost.open(e.currentTarget)}>
          New Post
        </button>
        <Show when={addShown()}>
          <button
            type="button"
            aria-label="Add Post"
            onClick={(e) => newPost.open(e.currentTarget)}
          >
            Add
          </button>
        </Show>
      </>
    );
  }
  // The login state, and buttons to log in and to log off.
  function Session() {
    const { isAuthenticated, login, logoff } = useAuth();
    return (
      <>
        <p>{isAuthenticated() ? "logged in" : "logged out"}</p>
        <button type="button" onClick={() => void login("Homer", "pw")}>
          do-login
        </button>
        <button type="button" onClick={() => void logoff()}>
          do-logoff
        </button>
      </>
    );
  }
  // The app shell, as in app.tsx: the provider sits inside the Router, the auth
  // and the guard, and the routes sit in a <Suspense>.
  render(() => (
    <MemoryRouter
      root={(props: ParentProps) => (
        <AuthProvider>
          <DraftGuardProvider>
            <NewPostProvider api={api}>
              <Session />
              <Openers />
              <A href="/about">About</A>
              <A href="/slow">Slow</A>
              <Suspense>{props.children}</Suspense>
            </NewPostProvider>
          </DraftGuardProvider>
        </AuthProvider>
      )}
    >
      <Route path="/" component={() => <h1>Home page</h1>} />
      <Route path="/about" component={() => <h1>About page</h1>} />
      <Route path="/slow" component={SlowPage} />
    </MemoryRouter>
  ));
  return { user: userEvent.setup(), setAddShown };
}
const confirmDialog = () =>
  screen.queryByRole("dialog", { name: "You have unsaved changes. Discard them?" });
// Fill every field and check the Category, so a submit sends the create.
async function fill(user: ReturnType<typeof userEvent.setup>) {
  const form = within(dialog()!);
  for (const label of [
    "Title",
    "Image URL",
    "Image description",
    "Photographer",
    "Photographer URL",
    "Photo page URL",
  ]) {
    await user.type(form.getByLabelText(label), "https://example.test/x");
  }
  await user.click(await form.findByRole("checkbox", { name: "Animals" }));
}
const dialog = () => screen.queryByRole("dialog", { name: "New Post" });

describe("<NewPostProvider /> (#214)", () => {
  it("both openers open the same one dialog, and each open loads the Categories", async () => {
    const { user } = renderOpeners();
    expect(dialog()).toBeNull();

    await user.click(screen.getByRole("button", { name: "New Post" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect((dialog() as HTMLDialogElement).open).toBe(true);
    expect(await within(dialog()!).findByRole("checkbox", { name: "Animals" })).toBeTruthy();
    await user.click(within(dialog()!).getByRole("button", { name: "Cancel" }));
    expect(dialog()).toBeNull();

    await user.click(screen.getByRole("button", { name: "Add Post" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(categoryListMock).toHaveBeenCalledTimes(2);
  });

  it("an open after a close shows empty fields and no old error", async () => {
    postCreateMock.mockRejectedValue(new Error("RPC Error: unsafe URL"));
    const { user } = renderOpeners();
    await user.click(screen.getByRole("button", { name: "New Post" }));
    const form = within(dialog()!);
    await user.type(form.getByLabelText("Title"), "typed");
    await user.click(await form.findByRole("checkbox", { name: "Animals" }));
    for (const label of [
      "Image URL",
      "Image description",
      "Photographer",
      "Photographer URL",
      "Photo page URL",
    ]) {
      await user.type(form.getByLabelText(label), "https://example.test/x");
    }
    await user.click(form.getByRole("button", { name: "Post" }));
    expect(await form.findByRole("alert")).toHaveTextContent("unsafe URL");
    await user.click(form.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));

    await user.click(screen.getByRole("button", { name: "New Post" }));
    const again = within(dialog()!);
    expect(again.getByLabelText("Title")).toHaveValue("");
    expect(again.queryByRole("alert")).toBeNull();
  });

  it("a create closes the dialog", async () => {
    postCreateMock.mockResolvedValue(CREATED);
    const { user } = renderOpeners();
    await user.click(screen.getByRole("button", { name: "New Post" }));
    const form = within(dialog()!);
    for (const label of [
      "Title",
      "Image URL",
      "Image description",
      "Photographer",
      "Photographer URL",
      "Photo page URL",
    ]) {
      await user.type(form.getByLabelText(label), "https://example.test/x");
    }
    await user.click(await form.findByRole("checkbox", { name: "Animals" }));
    await user.click(form.getByRole("button", { name: "Post" }));
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it("focus returns to the opener after a close", async () => {
    const { user } = renderOpeners();
    const add = screen.getByRole("button", { name: "Add Post" });
    await user.click(add);
    await user.click(within(dialog()!).getByRole("button", { name: "Cancel" }));
    expect(add).toHaveFocus();
  });

  it("if the opener is gone, focus is on the page body", async () => {
    const { user, setAddShown } = renderOpeners();
    await user.click(screen.getByRole("button", { name: "Add Post" }));
    setAddShown(false);
    await user.click(within(dialog()!).getByRole("button", { name: "Cancel" }));
    expect(document.body).toHaveFocus();
  });

  it("a route move without a Draft closes the dialog at once", async () => {
    const { user } = renderOpeners();
    await user.click(screen.getByRole("button", { name: "New Post" }));
    await user.click(screen.getByRole("link", { name: "About" }));
    expect(await screen.findByRole("heading", { name: "About page" })).toBeInTheDocument();
    expect(confirmDialog()).toBeNull();
    expect(dialog()).toBeNull();
  });

  it("a route move with a Draft asks; Keep editing keeps the dialog, Discard moves and closes it", async () => {
    const { user } = renderOpeners();
    await user.click(screen.getByRole("button", { name: "New Post" }));
    await user.type(within(dialog()!).getByLabelText("Title"), "typed");

    await user.click(screen.getByRole("link", { name: "About" }));
    expect(confirmDialog()).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("heading", { name: "Home page" })).toBeInTheDocument();
    expect(within(dialog()!).getByLabelText("Title")).toHaveValue("typed");

    await user.click(screen.getByRole("link", { name: "About" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(await screen.findByRole("heading", { name: "About page" })).toBeInTheDocument();
    expect(dialog()).toBeNull();
    expect(screen.queryByRole("dialog", { name: /discarded/ }), "no notice").toBeNull();
  });

  it("an open while a route move loads does nothing; after the move, an open works (#214)", async () => {
    const { user } = renderOpeners();
    await user.click(screen.getByRole("link", { name: "Slow" }));
    expect(
      screen.getByRole("heading", { name: "Home page" }),
      "the move loads",
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New Post" }));
    expect(dialog()).toBeNull();

    slowLoaded();
    expect(await screen.findByRole("heading", { name: "Slow page" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /discarded/ }), "no notice").toBeNull();
    await user.click(screen.getByRole("button", { name: "New Post" }));
    expect(dialog()).toBeInTheDocument();
  });

  it("a route move without a Draft closes the dialog when it starts, not when the page loads (#221 review)", async () => {
    const { user } = renderOpeners();
    await user.click(screen.getByRole("button", { name: "New Post" }));
    await user.click(screen.getByRole("link", { name: "Slow" }));
    expect(
      screen.getByRole("heading", { name: "Home page" }),
      "the move loads",
    ).toBeInTheDocument();
    expect(dialog(), "no typing while the page loads").toBeNull();

    slowLoaded();
    expect(await screen.findByRole("heading", { name: "Slow page" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /discarded/ }), "no notice").toBeNull();
  });

  it("a logoff closes the dialog, also one opened while the logoff waits (#221 review)", async () => {
    let loggedOff!: () => void;
    logoffMock.mockReturnValue(new Promise((r) => (loggedOff = () => r({ result: "ok" }))));
    const { user } = renderOpeners();
    await user.click(screen.getByRole("button", { name: "do-login" }));
    expect(await screen.findByText("logged in")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "do-logoff" }));
    await user.click(screen.getByRole("button", { name: "New Post" }));
    expect(dialog(), "the logoff waits for the back-end").toBeInTheDocument();

    loggedOff();
    expect(await screen.findByText("logged out")).toBeInTheDocument();
    expect(dialog()).toBeNull();
  });

  it("a route move during the create does nothing; then the result of the create shows", async () => {
    let land!: (post: PostView) => void;
    postCreateMock.mockReturnValue(new Promise((resolve) => (land = resolve)));
    const { user } = renderOpeners();
    await user.click(screen.getByRole("button", { name: "New Post" }));
    await fill(user);
    await user.click(within(dialog()!).getByRole("button", { name: "Post" }));

    await user.click(screen.getByRole("link", { name: "About" }));
    expect(confirmDialog()).toBeNull();
    expect(screen.getByRole("heading", { name: "Home page" })).toBeInTheDocument();
    expect(dialog()).toBeInTheDocument();

    land(CREATED);
    await waitFor(() => expect(dialog()).toBeNull());
    expect(screen.getByRole("heading", { name: "Home page" })).toBeInTheDocument();
  });
});
