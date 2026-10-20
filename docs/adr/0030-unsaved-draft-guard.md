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

## Addendum (2026-10-13) — the Caption thread holds its Caption (#127)

The Caption Comments panel opens from the Caption line, for the Caption shown. By
default, the Caption shown is the top-ranked Caption, so a Like on another Caption
can change it.

**Decision.** An open Caption thread holds the Caption shown. While the panel is
open, a re-rank does not change the Caption shown. After a close, the Caption line
follows the ranking again. A pick of another Caption in Top Captions closes the
panel, so it is a guarded move in the panel's scope. A pick of the Caption already
shown is not a guarded move.

**Difference from the Post hold.** A Draft holds the Post. The open panel holds the
Caption, with or without a Draft. Without this hold, a re-rank would close a thread
that the User is reading.

## Addendum (2026-10-16) — Post and Caption edits and deletes (#187)

#187 lets the Owner edit and delete a Post or a Caption. The consequences above
gave #187 two Event causes. One is a deleted Post or Caption. The other is a Post
that leaves the selected Category. #187 also adds a Post edit and a Caption edit.

**A deleted subject is a forced discard.** The notice names the subject: "This Post
was deleted. Your unsaved changes were discarded." or "This Caption was deleted.
Your unsaved changes were discarded." When the Post is gone, every form on it shows
the Post notice, the Caption forms too. The view-model finds the cause after a
refetch. A held Post that is not in the full list was deleted. A held Caption that
is not in its Post's list was deleted.

**A Category leave asks.** This replaces the Category case of the consequence
above. An Event can move the held Post out of the selected Category. Then the Post
stays shown, and the guard asks: "This Post is no longer in <Category>. Your
unsaved changes may not apply." "Keep editing" keeps every Draft and is the
default. Escape means "Keep editing". "Discard" drops every Draft. The question
cancels a waiting move, as a notice does. When the last Draft ends, the article
shows the top-ranked Post in the Category. A User's own Category change does not
keep the held Post. It asks first, as before. So "A held Post that leaves the list
is a forced discard" now applies only to a deleted Post.

**An open edit holds its subject.** An open Post edit holds the shown Post. An open
Caption edit holds the Caption shown. Each holds with or without a Draft, as the
open Caption thread does. An edit holds a Draft while a field differs from the
saved entity. Save sends only the changed fields, so a remote edit of another field
stays.

**A move names every scope that it unmounts.** `attempt(move, scopes)` takes a
list. A Caption pick names the Caption edit scope and the Caption thread scope. A
close of the Caption Comments panel names only the thread scope. A move with no
scope still asks about every Draft.

**The Owner's own delete asks once.** If the delete removes a Draft, the delete
question adds "Your unsaved changes will be discarded." The client drops those
Drafts when the Owner confirms. The poke can arrive before the delete result
([ADR-0016](0016-poke-rule-typed-receipt.md)), so the drop cannot wait. If the
delete fails, the forms keep their text, and the guard holds their Drafts again.

**The Owner's own Category edit keeps the Post shown.** A save can remove the
selected Category from the Post. The client then switches the filter to "All" when
it sends the save. So the Owner sees the edited Post, and no question shows.

**A viewer without a Draft hears the cause.** The Jedi route has one polite live
region. It says "This Post was deleted.", "This Caption was deleted." or "This Post
is no longer in <Category>." No dialog shows, so it does not stop a User who is
only reading.

**The New Post dialog reports no Draft.** The Nav keeps the dialog mounted across a
route move. A route move would then ask about a Draft that the move does not
remove. The edit mode of the dialog reports its Draft.

**Rejected.** A forced discard for a Category leave: the Post still exists, so the
Draft can still apply. One notice text for every cause: the Category text would say
that the Post was deleted. The labels "Save" and "Delete" for the question: in this
app, "Save" submits and "Delete" removes a saved row. Two dialogs for the Owner's
delete: one decision gets one question. A form that reports two scopes: each thread
form would need to know its parent.

## Addendum (2026-10-17) — form closure (#214)

#214 gives the New Post dialog a Draft. It also sets one rule for each way that a
form closes. The ways are a Cancel, Escape, a browser close of a dialog, and a move
that unmounts the form.

**One New Post dialog.** This replaces "The New Post dialog reports no Draft." The
Nav's New Post and the Post line's Add open the same dialog. `NewPostProvider` in
`app.tsx` mounts the dialog to open it, and unmounts it to close it. So each close
empties the form. A route move closes the dialog. With a Draft, the route-move
question asks first. While a route move loads, New Post and Add do nothing.
Otherwise the move would close the dialog when it ends, and drop the new Draft.
A logoff closes the dialog too.

**The New Post Draft.** The dialog holds a Draft while a text field is not blank
after a trim, or a Category is checked. The Draft has no scope. So only the logoff
and a route move ask about it.

**The Post's scopes.** Each form on the Post has a scope. The scopes are the Post
edit, the Caption edit, the Add Caption form and the two Comment threads. The Post
hold reads only these scopes. The view-model names them for each Post move and
Event, and for the Owner's own Post delete. So no Post move or Event touches the
New Post Draft. Each one still closes the Post's own forms. So no form stays open
with a Draft that the guard no longer holds.

**A Cancel with a Draft asks.** Before #214, "Cancel" called `clear()` at once. Now
a form's Cancel calls `draft.cancel(close)`. Without a Draft, the form closes at
once. With a Draft, the guard asks "You have unsaved changes. Discard them?" about
that form only. "Discard" drops that Draft and closes the form. "Keep editing"
keeps the form open with its Draft.

**Escape is a Cancel.** In a form with a Cancel, Escape runs the Cancel. A form
without a Cancel ignores Escape. An Escape that ends an IME composition is not a
Cancel. A form or a dialog stops its Escape, so an open menu or sidebar stays open.
A browser close of a Post dialog is also a Cancel: with a Draft, the dialog opens
again and asks.

**A write in flight blocks a move.** A form tells `useDraft` when its write is in
flight (`busy`). While a form writes, `attempt` refuses each move that would
unmount it. The route-move listener refuses every route move while any form
writes. Neither one asks a question. The User makes the move again after the write
ends. So the User always sees the result of a write.

**Focus returns to the opener.** After a close, focus returns to the button that
opened the form. The Comment edit now does this too.

**Rejected.** A New Post dialog that stays open across a route move: the
route-move question would have to skip its Draft. A closed dialog that keeps its
text as a Draft: the logoff would ask about text that the User cannot see. A
Cancel that drops a Draft with no question: one accidental Escape loses the text.
A scoped `attempt` for the Comment edit's Cancel: the thread scope also holds the
compose box and the other Comment edits. A route move that asks during a write:
"Discard" cannot stop the write, and a failed write shows no error. A New Post
dialog that stays open across a move that started before it opened: the provider
would have to know which move to skip.

**Consequences.** A new form on the Post needs a scope in the Post's list. A new
Cancel calls `draft.cancel`, and a new write reports `busy`. #210 adds a Cancel to
the compose box, so the compose box follows these rules.

## Addendum (2026-10-19) — one Comments panel (#210)

#210 moves each actions line under the content that it acts on. The Post's thread
and the Caption's thread now open in one place, under the Caption actions. So the
Post card shows one Comments panel at a time.

**An open of one thread closes the other.** This adds a guarded move to the list
above: a click that opens the other thread. The move names the other thread's
scope. With a Draft there, the guard asks. "Discard" closes that thread and opens
this one. "Keep editing" changes nothing. While a form in the other thread writes,
the click does nothing and asks nothing. A switch away from the Caption thread
ends the Caption hold, as any close does. So the Caption line can change at the
switch.

**The compose Cancel empties the box.** #210 gives the compose box a Cancel, under
the #214 rules. The box shows for as long as its panel is open. So the Cancel
empties the box, and the panel stays open. With a Draft, the guard asks about the
compose box only. Escape runs the Cancel. After the Cancel, focus moves to the
text field.

**Rejected.** Two open panels: both open in one place. A compose Cancel that
closes the panel: the close also unmounts the Comment edits in the thread's scope.
One Cancel could then ask two questions. A switch that keeps the Caption hold: the
hold serves an open Caption thread, and the switch closes it.
