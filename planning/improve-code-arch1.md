❯ /improve-codebase-architecture

⏺ Report path:

docs/architecture-review-20260609-200414.html

No CONTEXT.md/docs/adr/ exist — domain nouns taken from code; no ADR contradicted.

Three deepening candidates:

```pre
  ┌─────┬───────────────────────────────┬────────────┬────────────────────────────────────────────────────┐
  │  #  │           Candidate           │  Strength  │                    Core friction (quoted)          │
  ├─────┼───────────────────────────────┼────────────┼────────────────────────────────────────────────────┤
  │     │ Collapse live Message stream  │            │ dedupe written twice (MessagePanel.tsx:26 & :86),  │
  │ 01  │ → createConvMessages(conv)    │ Strong     │ mutable let listStale = false (:16), 3 effects     │
  │     │                               │            │ orchestrate ws+rpc — merge logic only reachable    │
  │     │                               │            │ via DOM + two mocks                                │
  ├─────┼───────────────────────────────┼────────────┼────────────────────────────────────────────────────┤
  │     │ Extract RPC-mutation state    │ Worth      │ setError/setPending/try/catch/finally copied into  │
  │ 02  │ machine → createRpcAction(fn) │ exploring  │ AgentManager:16, ConversationManager:39,           │
  │     │                               │            │ MessagePanel:73; success step diverges             │
  ├─────┼───────────────────────────────┼────────────┼────────────────────────────────────────────────────┤
  │     │ Own entity identity at the    │ Worth      │ types say id: bigint (Agent.d.ts:4) but await      │
  │ 03  │ RPC seam                      │ exploring  │ response.json() (backend-rpc.ts:46) yields         │
  │     │                               │            │ number → Number(id) tax scattered ~10×             │
  └─────┴───────────────────────────────┴────────────┴────────────────────────────────────────────────────┘
```

Top pick: 01 — biggest locality+leverage gain, passes the deletion test cleanly. 02/03 each carry a caveat
(success-step divergence; generated .d.ts can't be hand-edited).

Resume this session with:
claude-max --resume 0b3c0d05-9492-4b05-955b-e9760721d742
