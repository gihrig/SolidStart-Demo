# Unsaved Drafts are guarded by one app-level guard

#124 adds the Comment thread panel to `FeaturedPost`. A Post change, a panel close, a
page move or a logoff unmounts its forms, and the typed text is gone. The Add Caption
form had the same gap before #124: `FeaturedPost` closes it when the Post changes.
Later forms will have it too, for example #127 Caption Comments and #187 edits.

## Decisions

**A Draft is the unsaved text of a form.** A Comment compose box or an Add Caption form
holds a Draft when its text is not blank after a trim. An open Comment edit holds a
Draft when its text differs from the saved Comment.

**A form reports yes or no.** A form calls `useDraft({ dirty, scope, notice })`. The
hook makes the form's key, a `Symbol`, so two forms never share a key. An effect
reports `dirty()` to the guard each time it changes, so a change of the saved text also
reports. "Cancel" calls `clear()`. The form keeps its own text. The guard holds only the
keys with a Draft, each with its scope.

**Every user-started move goes through `guard.attempt(move)`.** With no Draft, the
move runs at once. With a Draft, the move waits in `pendingMove`, and the UI shows the
confirm dialog. "Discard" calls `confirmMove()`, which runs the move. "Keep editing"
calls `cancelMove()`. The guarded moves are:

- a Top Photo click;
- a category change that changes the selected Post;
- a click that closes the Comments panel;
- the logoff;
- an in-app route move.

A move that unmounts only one group of forms names the scope of that group:
`attempt(move, scope)`. It asks only about the Drafts in that scope, and "Discard" drops
only those Drafts. The Comments panel close uses `postComments.draftScope`, so an Add
Caption Draft does not block it.

**One guard per app.** `createDraftGuard` (`lib/createDraftGuard.ts`) builds it.
`DraftGuardProvider` in `app.tsx` shares it. The `Nav` and the Jedi view-model use the
same guard, so a later route gets the guard with no new wiring.

**A Draft holds the shown Post.** While a Draft exists, a re-rank does not move the
article. The view-model keeps the Post that was shown when the first Draft started.
When the last Draft ends, the article follows the ranking again. A held Post that
leaves the list is a forced discard.

**Page moves use the router and the browser.** The router calls the guard through
`useBeforeLeave`: it calls `preventDefault()`, and "Discard" calls `retry(true)`. A
reload, a tab close or an external link fires `beforeunload`. The guard listens to
`beforeunload` only while a Draft exists. The browser then shows its own text.

**A forced discard shows a notice.** An Event can remove the subject of a Draft, for
example a Comment under edit that its Owner deletes in another tab. The guard cannot
block that move. The UI shows "This Comment was deleted. Your unsaved changes were
discarded." with one "OK" button. If a move waits, the notice cancels it, and the
user stays where they were. When the form cannot name the cause, the notice is "Your
unsaved changes were discarded." An example is a session that ends in another tab.

**One dialog component.** `ConfirmDialog` uses a native `<dialog>` with `showModal()`,
as `CreatePostDialog` does. The guard text is "You have unsaved changes. Discard
them?". "Keep editing" is the default button, and Escape means "Keep editing". The
other button is "Discard". Without a `cancelLabel`, the dialog shows one "OK" button
and works as the notice.

## Considered and rejected

- **`window.confirm`.** It cannot follow the theme, and it blocks the page's script
  while open. A standard project must not teach it.
- **`useDisclosure` for a panel that holds a Draft.** Escape and a click outside the
  panel close it, and either one drops the Draft.
- **The guard inside `createJediFeed`.** The `Nav` logoff and other routes cannot
  reach it.
- **The Draft text in the view-model.** Every form becomes controlled, and the guard
  needs only yes or no.
- **One dialog text per form.** Two forms can hold Drafts at the same time.
- **Run the waiting move after a forced discard.** Another Draft can still exist, and
  the move would discard it without a question.
- **One question for every move.** A panel close then asks about an Add Caption Draft
  that the close does not unmount.
- **Guard only `beforeunload`.** An in-app link does not unload the page, so it does
  not fire `beforeunload`.

## Consequences

- A new form with free text reports its Draft. A new move that can unmount a form
  goes through `guard.attempt`.
- Post edit and delete arrive with #187. Then a deleted Post or Caption, or a Post
  that leaves the selected category, is a forced discard, and it must show the
  notice. #187 records this.
- The Add Caption form joins the guard in #124.
