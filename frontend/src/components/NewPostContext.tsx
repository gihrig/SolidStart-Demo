import {
  createContext,
  createEffect,
  createSignal,
  on,
  Show,
  useContext,
  type ParentComponent,
} from "solid-js";
import { useLocation } from "@solidjs/router";
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
 * The one New Post dialog (#214), in `app.tsx` inside `DraftGuardProvider`.
 * The Nav's New Post and the Post line's Add open it. It mounts the dialog to
 * open it, and unmounts it to close it, so each close empties the form. After
 * a close, focus returns to the opener; if the opener is gone, focus stays on
 * the page body.
 *
 * A route move closes the dialog. With a Draft, the guard's route-move
 * question asks first. The close follows the location, not a `useBeforeLeave`
 * listener: after "Discard", the router runs the move again past every
 * listener.
 */
export const NewPostProvider: ParentComponent<NewPostProviderProps> = (props) => {
  const [opener, setOpener] = createSignal<HTMLElement>();
  const close = () => {
    const el = opener();
    setOpener(undefined);
    if (el?.isConnected) el.focus();
  };
  const location = useLocation();
  createEffect(
    on(
      () => [location.pathname, location.search, location.hash],
      () => {
        if (opener()) close();
      },
      { defer: true },
    ),
  );

  return (
    <NewPostContext.Provider value={{ open: (el) => setOpener(el) }}>
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
