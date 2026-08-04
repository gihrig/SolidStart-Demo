# RPC mutations own their pending + error via `createRpcAction`

"Fire an RPC, reflect its pending + error" is a single concept that was
hand-rolled at four call sites, each answering it slightly differently:
`conversationWorkspace` used `createRpcAction` (`src/lib/createRpcAction.ts`),
but `createConvMessages.send` re-implemented the try/catch with no pending,
`AuthContext.login` re-implemented it and additionally re-threw, and
`MessagePanel` tracked its own `sending` signal the hook never exposed
(#55, candidate 1).

We make `createRpcAction` the **single owner** of that choreography. Every RPC
_mutation_ (an operation that changes back-end state and whose progress/failure
the UI reflects) runs its RPC — plus any success step — inside a
`createRpcAction`, and exposes the action's `pending` and `error`. Components
consume those accessors instead of tracking their own; `MessagePanel` and
`LoginForm` drop their local `sending`/`loading` signals.

The success step runs _inside_ the wrapped `fn` so its rejections also land in
`error` and still clear `pending` in `finally`. The conversation/agent pre-checks
(`if (!conv) …`) run _outside_ `run()`, so "nothing selected" never flips pending.

## Naming

Every mutation exposes its pending flag as `pending` — `ConvMessages.pending`,
`AuthContext.pending` — matching `RpcAction`'s own vocabulary. Consistency was
chosen deliberately over per-domain gerunds so a reader never has to wonder why
one surface says `sending` and another `pending`. (`conversationWorkspace`'s
pre-existing `creatingAgent`/`creatingConv` are left as-is; renaming them is out
of this cut's scope.)

## Considered and rejected

- **Keep the per-site hand-rolls** — rejected: the pending+error dance was
  already written four different ways, so the "is a send in flight?" question had
  no single testable owner and `MessagePanel` had to invent its own `sending`.
- **`login` returns a success boolean, symmetric with `send`** — rejected: no
  caller branches on it. `LoginForm` reacts to `error()` and `isAuthenticated`,
  never to a return value, so `login` stays `Promise<void>`. (`send` keeps its
  `boolean` because `MessagePanel` branches on it to `form.reset()`.)
- **Split send-failure and connection/history errors into two surfaces** —
  rejected for this cut: `MessagePanel` shows one error box today. `ConvMessages`
  keeps one displayed `error()` by merging — `sendAction.error() ?? feedError()`
  — preserving the single-error UX. A future cut may separate them.

## Consequences

- **`login` no longer re-throws.** The previous `throw e` (AuthContext) produced
  an _unobserved_ unhandled rejection — its only caller, `LoginForm`, wrapped the
  call in `try/finally` with no `catch` and displayed failures via `error()`.
  Routing through `run()` (which resolves `undefined` on failure) removes the
  rejection with no loss of observable behaviour.
- **`logoff` is deliberately NOT routed through `createRpcAction`.** Its `finally`
  clears local auth state even when the RPC fails — a failed logoff must still log
  you out locally. `createRpcAction` would only run that clearing as a _success_
  step, so a failed logoff would leave you authenticated. Do not "unify" `logoff`
  into the action without first giving `createRpcAction` an always-run step.
- Because `login` is `Promise<void>`, its wrapped `fn` returns `true` on success
  rather than falling off the end as `undefined`; `undefined` is `run()`'s failure
  sentinel (`src/lib/createRpcAction.ts`), so a void success would otherwise be
  indistinguishable from failure to any future caller that checks the result.
