import {
  createContext,
  createEffect,
  createSignal,
  on,
  Show,
  useContext,
  type ParentComponent,
} from "solid-js";
import { useIsRouting } from "@solidjs/router";
import { useAuth } from "~/components/AuthContext";
import PostDialog, { type PostDialogProps } from "~/components/PostDialog";

/** The app's one New Post dialog (#214). */
export interface NewPost {
  /** Open the dialog. `opener` is the button that opened it: focus returns to
   *  it after the close. */
  open: (opener: HTMLElement) => void;
}

/** Without a provider, an open does nothing: a component test without the app
 *  shell renders no dialog. */
const NewPostContext = createContext<NewPost>({ open: () => {} });

export interface NewPostProviderProps {
  /** Passed through to the dialog (the inject-or-default idiom). */
  api?: PostDialogProps["api"];
}

/**
 * The one New Post dialog (#214), in `app.tsx` inside `AuthProvider` and
 * `DraftGuardProvider`.
 * The Nav's New Post and the Add in the Post actions open it. It mounts the
 * dialog to open it, and unmounts it to close it, so each close empties the
 * form. After a close, focus returns to the opener; if the opener is gone,
 * focus stays on the page body.
 *
 * A route move closes the dialog when the move starts, so no text can be
 * typed while the next page loads (#221 review). With a Draft, the guard's
 * route-move question asks first. The close follows `isRouting`, not a
 * `useBeforeLeave` listener: after "Discard", the router runs the move again
 * past every listener. A refused move never starts. While a route move loads,
 * an open does nothing.
 *
 * A logoff closes the dialog too (#221 review). The logoff asks about the
 * Draft first. A dialog opened while the logoff waits for the back-end closes
 * when the logoff ends.
 */
export const NewPostProvider: ParentComponent<NewPostProviderProps> = (props) => {
  const [opener, setOpener] = createSignal<HTMLElement>();
  const close = () => {
    const el = opener();
    setOpener(undefined);
    if (el?.isConnected) el.focus();
  };
  const isRouting = useIsRouting();
  createEffect(
    on(isRouting, (routing) => {
      if (routing && opener()) close();
    }),
  );
  const { isAuthenticated } = useAuth();
  createEffect(
    on(isAuthenticated, (loggedIn) => {
      if (!loggedIn && opener()) close();
    }),
  );

  return (
    <NewPostContext.Provider value={{ open: (el) => !isRouting() && setOpener(el) }}>
      {props.children}
      <Show when={opener()}>
        <PostDialog api={props.api} onClose={close} />
      </Show>
    </NewPostContext.Provider>
  );
};

export function useNewPost(): NewPost {
  return useContext(NewPostContext);
}
