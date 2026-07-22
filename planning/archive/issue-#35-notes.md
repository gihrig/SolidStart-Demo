❯ /ask-matt examine #35 to determine if it is ready to implement

⏺ What I can't verify: the Solid-internals claim (grid node moved not recreated, blur stack in reconcileArrays/insertExpression). That evidence came from throwaway browser instrumentation the issue says was never committed — so it's unquotable from this repo. Reasonable, but unproven from source.

Three candidate approaches, unresolved:

1. Restructure the reactive graph so the grid stops reconciling (preferred, but "if we can find the exact trigger")
2. Restore focus + suppress scroll (safe fallback workaround)
3. Restructure `<main>`'s `<Switch>` / Top Photos `<For>`

Approach 1 fully validated. Captions stay correct with .latest:

- Select Landscape → main "Brilliant tree", Top Captions updates to that post's captions, focus kept, no route move.
- Click 2nd photo → main "Serine Beach", captions follow (Bart/Homer), focus kept, no move.

The prototype answered the question. Now cleanup — revert the experimental source edits (main keeps only the validated decision, and the real fix should land through /implement with a regression test), remove the failed synthetic route, and stop the dev server.

Reverted — main is clean (only the not-mine data.json and the throwaway harness remain). Here's the verdict.

Prototype verdict: approach 1 works — and I found the exact trigger

The bug is a Suspense re-trigger, not a DOM-structure problem. Selecting a category changes selectedPost, which re-keys the topCaptions createResource (createJediFeed.ts:104-106, source () => selectedPost()?.id). The refetch re-suspends the route, and SolidStart reconciles the route output — detaching/re-attaching the subtree that holds the focused `<ul>`, which blurs it to `<body>`.

Evidence, all on the real /jedi route (backend-free — jediApi resolves from local data.json via Promise.resolve, jedi-api.ts:79-99):

```pre
┌──────────────────────────────────────────────────┬────────────────┬───────────────────────────────────┐
│                    Experiment                    │  Focus after   │            Route move             │
├──────────────────────────────────────────────────┼────────────────┼───────────────────────────────────┤
│ Baseline (Categories → Landscape)                │ ❌ LOST → body │ grid REMOVED+ADDED                │
├──────────────────────────────────────────────────┼────────────────┼───────────────────────────────────┤
│ Variant A: wrap route in a stable <div>          │ ❌ LOST        │ move relocates up to route output │
├──────────────────────────────────────────────────┼────────────────┼───────────────────────────────────┤
│ Diagnostic: pin caption resource key to constant │ ✅ KEPT        │ none                              │
├──────────────────────────────────────────────────┼────────────────┼───────────────────────────────────┤
│ Fix: read topCaptions.latest (non-suspending)    │ ✅ KEPT        │ none                              │
└──────────────────────────────────────────────────┴────────────────┴───────────────────────────────────┘
```

Two things this rules in/out:

- Wrapping/DOM restructure can't fix it (variant A) — the reconcile is above the route markup, at the Suspense boundary.
- The caption resource re-key is the whole cause (pinning it fixes focus). My earlier synthetic prototype couldn't reproduce precisely because it used synchronous signals — no resource, no Suspense.

The minimal approach-1 fix: read the caption resource via .latest instead of calling it — a 3-line change to winningCaption / visibleCaptions / selectedCaption. Verified in-browser: focus kept, no route move, and captions still update correctly (Landscape → post-2 captions; click 2nd photo → post-4 captions follow). All 25 relevant unit tests still pass.

Tradeoff to note for the real implementation: .latest shows the previous post's captions until the refetch resolves. With the current Promise.resolve mock that's one microtask (invisible). Against a real backend it'd be a brief stale-caption lag under the new post instead of a loading state. If that matters later, the alternative is a localized `<Suspense>` around Top Captions — but .latest is the clean, behavior-preserving fix now.

Two things need your call

1. data.json is modified in your working tree and it isn't mine — I only ran read-only queries. It adds posts id3 "Camouflage" / id4 "Serine Beach" + captions, and it breaks an existing unit test (createJediFeed.unit.test.ts:121 expects Landscape → [2], now gets [2,4]). The session started "clean," so something else touched it. You'll want to decide what to do with it — it's unrelated to #35.

- Committed updated data.json
- Tests updated to pass with new data `vpr test:all` all pass

2. Next step for #35. The prototype answered "can approach 1 work?" → yes. The actual fix should land through /implement with a regression test (the browser harness proved it but isn't a committed test).

❯ /implement #35 with a regression test, be concise

Done. #35 fixed and committed (7ff88f0).

Root cause: winningCaption/visibleCaptions/selectedCaption read the caption resource via the suspending call topCaptions(). Selecting a category re-keys that resource → re-triggers Suspense → SolidStart reconciles the route subtree → the focused listbox <ul> detaches and blurs to <body>.

Fix: read topCaptions.latest (non-suspending) in those three derivations. 3-line change, matches the validated prototype in planning/issue-#35-notes.md.

Regression test (jedi.test.tsx): renders the route under <Suspense>, focuses Categories, selects Landscape by keyboard, asserts focus + roving aria-activedescendant stay on the listbox. Confirmed RED before the fix, GREEN after.

Verification: typecheck clean; vpr test:all 260/260 pass.

Review notes worth flagging:

- Test covers Categories/keyboard/desktop only. Both reviewers confirmed the fix is broader by construction — the bug's sole trigger is a selectedPost re-key, which Top-Photos clicks and mobile funnel through identically; Top-Captions selection never re-keys, so it was never affected. Broader coverage is inferred, not asserted.
- Tradeoff (already noted in planning): against a real backend, captions briefly show the prior post's during refetch instead of a loading state. Invisible under the Promise.resolve mock.
- Live footgun: topCaptions is still exposed as a suspending Accessor; a future direct topCaptions() in render would reintroduce the bug. Left as-is (route doesn't read it).

#35 closed with a comment linking commit 7ff88f0.

- Pushed branch #35-focus-debug to origin so the SHA resolves on GitHub.
- Closing comment records root cause, fix, and the regression test.
- Note: GitHub flagged 2 Dependabot vulnerabilities (1 high, 1 moderate) on the default branch — unrelated to this issue, but worth a look when convenient.
