# Unsaved Drafts are guarded by one app-level guard

#124 adds the Comment thread panel to `FeaturedPost`. A Post change, a panel close, a
page move or a logoff unmounts its forms, and the typed text is gone. The Add Caption
form had the same gap before #124: `FeaturedPost` closes it when the Post changes.
Later forms will have it too, for example #127 Caption Comments and #187 edits.

## Decisions

**A Draft is the unsaved text of a form.** A Comment compose box or an Add Caption form
holds a Draft when its text is not blank after a trim. An open Comment edit holds a
Draft when its text differs from the saved Comment.

**A form reports yes or no.** A form calls `useDraftForm({ dirty, scope, notice, … })`.
The hook makes the form's key, a `Symbol`, so two forms never share a key. An effect
reports `dirty()` to the guard each time it changes, so a change of the saved text also
reports. "Cancel" ends the Draft. The form keeps its own text. The guard holds only the
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
a form's Cancel calls the hook's `cancel`, which runs the form's `close`. Without a Draft, the form closes at
once. With a Draft, the guard asks "You have unsaved changes. Discard them?" about
that form only. "Discard" drops that Draft and closes the form. "Keep editing"
keeps the form open with its Draft.

**Escape is a Cancel.** In a form with a Cancel, Escape runs the Cancel. A form
without a Cancel ignores Escape. An Escape that ends an IME composition is not a
Cancel. A form or a dialog stops its Escape, so an open menu or sidebar stays open.
A browser close of a Post dialog is also a Cancel: with a Draft, the dialog opens
again and asks.

**A write in flight blocks a move.** `useDraftForm` runs the form's write, so it
reports when the write is in flight. While a form writes, `attempt` refuses each move that would
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
form builds on `useDraftForm`, which runs its Cancel and reports its write. #210 adds a Cancel to
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
text field. In the empty box, Escape closes the Comments panel, as a click on its
toggle does. Focus moves to the toggle, and the close goes through the guard.

**An inline form's Escape cancels the browser's Escape.** The Comment forms and
the Caption forms run their Cancel in the Escape keydown. With a Draft, the
Cancel opens the question at once. The browser then takes the same Escape as a
close of that new dialog. So each Escape that a form acts on calls
`preventDefault`, and the question stays open.

**Tab stays in a dialog.** Tab and Shift+Tab move focus between the enabled
controls of a modal dialog, and wrap (`keepDialogFocus`). This holds for the
question, the notices, the New Post dialog and the Login dialog. From the last
control, a browser alone moves focus out of the dialog, or does not move it at
all. "Keep editing" is the question's default and its last button, so before
this rule, Tab did not reach "Discard".

**Rejected.** Two open panels: both open in one place. A compose Cancel that
closes the panel: the close also unmounts the Comment edits in the thread's scope.
One Cancel could then ask two questions. A switch that keeps the Caption hold: the
hold serves an open Caption thread, and the switch closes it.

## Addendum (2026-10-30) — one hook for each form (#270)

This addendum builds C-24 of the 2026-10-30 architecture review. Before #270, each
form wrote the #214 rules by hand. It reported its Draft and its write, wrapped its
Cancel, handled Escape and guarded a late write result. #251 had to fix one IME
rule in four key handlers.

**One hook owns the form rules.** Each form builds on `useDraftForm`. The hook
runs the write, so it reports the write in flight itself. It ends the Draft after
a save. When a write ends after its form unmounts, the result changes nothing in
the form. A Cancel with a Draft asks first. In a form with a Cancel, Escape runs
the Cancel. A form without a Cancel ignores Escape. An Escape that ends an IME
composition is not a Cancel. Each form keeps its fields, its Draft test, its write
and its remote-edit merge.

**Escape can run another action.** A form can name what Escape runs in place of
the Cancel. In the empty compose box, Escape closes the Comments panel (#210).

**A Post dialog keeps its own Escape.** It takes Escape from its `<dialog>`,
through the `cancel` event, and its handlers call the hook's Cancel. A browser
close is still a Cancel, as #214 says.

**Consequences.** #270 updates the earlier text of this ADR in place. Where it
named `useDraft`, `draft.cancel`, `clear()` or `busy`, it now names `useDraftForm`
and the hook's `cancel`. No form calls `useDraft` now: it is internal to the hook.
A new form gives the hook its
Draft test, its scope, its Cancel step and its write. "A new form on the Post
needs a scope in the Post's list" still holds.

**Rejected.** A `<DraftForm>` component that renders the `<form>`: a Post dialog
takes Escape from its `<dialog>`. Also, the Comment forms share their key handler
with the Enter rule (#246). A hook that leaves the write in the form: each form
must still remember the late-result check. The remote-edit merge in the hook: it
is a field rule, and the forms hold different fields. An Escape tied to the state
of the Cancel button: it adds a hidden link between a key and a button.

## Addendum (2026-10-31) — a scope tree, the Post hold and the Caption hold (#271)

This addendum builds C-25 and C-26 of the 2026-10-30 architecture review. It also
closes two gaps that probe tests measured on 2026-10-31. A **Post hold** is the
time in which the Post card keeps the Post shown. A **Caption hold** is the time
in which the Caption line keeps the Caption shown (`CONTEXT.md`).

**A scope can sit under another scope.** A scope can have a parent scope. A move
names one scope. It asks about the Drafts in that scope and in each scope under
it. A move with no scope still asks about every Draft. A form still reports one
scope, so no form needs to know its parent. This replaces the paragraph "A move
names every scope that it unmounts" of the #187 addendum.

**Four scopes on the Post card.** The Post thread scope and the Caption scope sit
under the Post scope. The Caption thread scope sits under the Caption scope. The
Post edit and the Add Caption form report in the Post scope. The Caption edit
reports in the Caption scope. No move closes one of these three forms alone. Each
Post move and Event names the Post scope, and a Caption pick names the Caption
scope. The Owner's own Caption delete releases the Caption scope, so it also
releases the Caption edit. This replaces the first four sentences of "The Post's
scopes" in the #214 addendum. Its rule stays: no Post move or Event touches the
New Post Draft.

**A form takes its scope from where it mounts.** The Post card gives the Post
scope to each form in it. The Caption line gives the Caption scope to the Caption
edit. Each Comment thread gives its own scope to its forms. A form outside these
places has no scope, such as the New Post dialog. So a new form on the Post card
is in the Post scope, and it needs no scope prop. If one move closes a new group
of forms alone, the group gets its own scope under its subject. This replaces "A
new form on the Post needs a scope in the Post's list" in the #214 and #270
addenda.

**An open Comments panel starts a Post hold.** A Draft on the Post, an open Post
edit or an open Comments panel starts a Post hold. The Post hold ends when the
last of them ends. The panel counts with or without a Draft, as an open edit does.
So a re-rank no longer closes a thread that the User is reading. An open Caption
Comments panel starts a Caption hold and a Post hold. A switch between the two
panels keeps the Post hold. A switch away from the Caption thread still ends the
Caption hold (#210). An Event that moves the Post out of the selected Category
keeps the Post shown until the Post hold ends. Without a Draft, no question shows.
"Discard" on that question closes the Post edit and both Comments panels, so the
Post hold ends and the Post card moves. This replaces "A Draft holds the Post." in
"Difference from the Post hold" of the #127 addendum.

**A Draft keeps the Add Caption form open.** On a Post with no Caption, the Add
Caption form shows in place of the Caption. Before #271, a Caption from another
User then closed the form, and the guard discarded its Draft with a notice. But
the subject of the form, the Post, was still there. Now, at its first Draft, the
form becomes an opened Add Caption form, as after a click on Add. So a Caption
that arrives does not close it, and the form gets its Cancel. Without a Draft, the
Caption replaces the form, as before.

**One module owns both holds.** `createSelection` decides which Post and which
Caption the Post card shows. It owns the picks, the Post hold, the Caption hold,
the guarded moves and the change causes of #187. It also owns the Owner's own
save and delete, and the live region of the route. `createJediFeed` composes it
with the Likes, the Comment threads and the Feed.

**Rejected.** A scope for each form: no move closes the Post edit, the Add Caption
form or the Caption edit alone. Optional scope props: a missed prop put a Draft in
no scope, so each scoped move skipped it. Required scope props on each form: each
new form must get its scope through each component between. A module for the two
holds alone: the selection reads them, and they read the selection. An Add Caption
form with no Draft as a start of a Post hold: each Post with no Caption would then
stay shown. A forced discard when a Caption arrives: the subject of the form
stays.

## Addendum (2026-11-02) — one modal dialog module (#278)

This addendum builds C-27 of the 2026-10-30 architecture review. Before #278, each
modal dialog wired the native `<dialog>` by hand. ConfirmDialog, PostDialog and
LoginDialog each handled the open, Escape, the browser close and Tab. The copies
differed. A browser close during a login closed the Login dialog, so a failed
login showed no error.

**One module owns the dialog rules.** Each modal dialog builds on `ModalDialog`.
The dialog opens when it mounts. The owner unmounts it to close it. Escape runs
the dialog's Cancel. While the dialog is busy, Escape does nothing. An Escape that
ends an IME composition is not a Cancel. The dialog stops its Escape, so an open
menu or sidebar stays open. Tab and Shift+Tab stay in the dialog. Each dialog
keeps its content and its write.

**A browser can close a dialog.** Chromium, Firefox and WebKit close a modal
dialog after repeated Escape, even when the page refuses the `cancel` event
(measured 2026-11-02, Playwright 1.63). The browser first sends a `cancel` that
the page cannot refuse, and then a `close`. A browser close is a Cancel. While the
dialog is busy, it opens again and runs no Cancel. With a Draft, it opens again
and then runs the Cancel, so the question shows over it. One Escape runs the
Cancel one time only.

**The Login dialog follows these rules.** While the login is in flight, a browser
close opens the Login dialog again. So the User always sees the login result. Each
open shows empty fields and no old error. Before #278, the dialog stayed mounted.
So a typed username and password stayed in it after a Cancel.

**The first focus is the `autofocus` element.** The question focuses its default
button by this attribute. Without one, the browser focuses the first control.

**Consequences.** A new modal dialog builds on `ModalDialog`. It gives the module
its Cancel, and its busy state when it writes. A dialog whose Cancel can ask a
question also gives `reopen`. ConfirmDialog keeps its `open` prop.

**Rejected.** A dialog that stays mounted and follows an `open` prop: a reused
modal dialog can close when it opens over another one with no user gesture
(#214). Two open models would also keep two code paths. A browser close that
always opens the dialog again before the Cancel: the question would then open
again over the dialog behind it, with no user gesture. An `initialFocus` prop: the
`autofocus` attribute is the platform rule. A module that also takes the Escape of
the inline forms: those forms are not dialogs, and `useDraftForm` owns their
Escape (#270).
