# Unsaved Drafts are guarded by one app-level guard

Origin: #124

A Post change, a panel close, a page move or a logoff unmounts the forms on the
page, and the typed text is gone. A Draft is the unsaved text of a form. The
unit and e2e tests of `createDraftGuard`, `useDraftForm`, `createSelection` and
`ModalDialog` hold the detailed behavior rules. `GLOSSARY.md` holds the terms.

## Decisions

- **One guard for the app.** `createDraftGuard` builds it, and
  `DraftGuardProvider` in `app.tsx` shares it. The `Nav`, the Jedi view-model
  and each later route use the same guard with no new wiring.
- **Each user move goes through `guard.attempt(move, scope?)`.** With no Draft,
  the move runs at once. With a Draft, the move waits, and the confirm dialog
  asks. "Discard" runs the move, and "Keep editing" drops it. In-app route
  moves reach the guard through `useBeforeLeave`. While a Draft exists, the
  guard listens to `beforeunload`, for a reload or a tab close.
- **A form reports only "yes" or "no".** Each form reports whether it holds a
  Draft, and the scope it holds it in. The form keeps its own text. The guard
  holds only the keys with a Draft.
- **Scopes form a tree.** A scope can sit under a parent scope. A move names one
  scope, and it asks only about the Drafts in that scope and the scopes under
  it. A move with no scope asks about each Draft. A form takes its scope from
  where it mounts, so no form needs a scope prop or knows its parent.
- **The Post hold and the Caption hold.** A Post hold keeps the Post shown on
  the Post card; a Caption hold keeps the Caption shown on the Caption line.
  A Draft on the Post, an open edit or an open Comments panel starts a Post
  hold. An open Caption edit or Caption thread starts a Caption hold. So a
  re-rank never moves a form or a thread that the User is using.
  `createSelection` owns both holds, the picks and the guarded moves.
- **A move the guard cannot block is a forced discard with a notice.** An Event
  can delete the subject of a Draft. The UI then names the cause, for example
  "This Comment was deleted. Your unsaved changes were discarded." The notice
  cancels a waiting move, because the move could discard another Draft with no
  question.
- **`useDraftForm` owns the form rules.** It runs the form's write and reports
  it in flight, and `attempt` refuses a move that would unmount a form while it
  writes. A Cancel with a Draft asks first. Escape runs the Cancel, except when
  it ends an IME composition.
- **`ModalDialog` owns the dialog rules.** Each modal dialog builds on it. The
  dialog opens when it mounts and closes when its owner unmounts it. It handles
  Escape, the browser close and the Tab loop. A browser can close a modal
  dialog after repeated Escape, so a browser close counts as a Cancel. While the
  dialog is busy, or holds a Draft, the dialog opens again.
- **A native `<dialog>`, not `window.confirm`.** `ConfirmDialog` builds on
  `ModalDialog`. "Keep editing" is the default button.

## Considered and rejected

- **`window.confirm`.** It cannot follow the theme, and it blocks the page's
  script while it is open.
- **The guard inside `createJediPage`.** The `Nav` logoff and the other routes
  cannot reach it.
- **The Draft text in the view-model.** Each form would become controlled, and
  the guard needs only "yes" or "no".
- **One question for each move.** A panel close would then ask about a Draft
  that the close does not unmount.
- **Guard only `beforeunload`.** An in-app link does not unload the page.
- **A scope for each form, or scope props.** No move closes some forms alone,
  and a missed prop puts a Draft in no scope, so each scoped move skips it.
- **A dialog that stays mounted and follows an `open` prop.** A reused modal
  dialog can close when it opens over another one.

## Consequences

- A new form builds on `useDraftForm`. A new move that can unmount a form goes
  through `guard.attempt`.
- A new modal dialog builds on `ModalDialog`.
- If one move closes a new group of forms alone, the group gets its own scope
  under its subject.
