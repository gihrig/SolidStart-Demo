Resume this session with:
claude-max --resume 7bbef09e-5a8c-4e90-a815-7b249d825203
claude --model claude-opus-4-8 --effort high --model claude-opus-4-8 --effort 323.86s user 39.78s system 3% cpu 3:02:28.69 total

---

Plan written to planning/issue-13-plan.md. Self-review done — all 5 issue-#13 requirements map to tasks (coverage table at the bottom), no placeholders, type/name consistency holds across tasks.

Shape:

- Phase 1 (Claude) — data layer: tsconfig (resolveJsonModule), src/types/jedi.ts, src/lib/jedi/data.json, src/lib/jedi/jedi-api.ts + unit tests (ranking, author-join, derived commentCount, sanitizer-routing spy). Gate: vpr test:unit + check:type.
- Phase 2 (Claude) — rewire src/routes/jedi.tsx to createResource(jediApi…); jsdom component test whose red driver is "Cute appears in the sidebar"; grep-guard proves no hard-coded data remains (except Hero bg, intentionally out of scope). Gate: vpr test:all + check + build.
- Phase 3 (User) — e2e (needs :8080) + visual light/dark check.

Every file's complete code is in the plan; TDD red→green→commit per task.

One thing needs your call before execution (flagged at the top of the plan): the "Cute" category icon. There's no cute glyph in the sprite and IconName is drift-tested, so the plan defaults to reusing fire-heart (one value in data.json). It's a bit odd next to the like counter's fire-heart. Options: keep fire-heart, pick another existing glyph, or add a dedicated icon via the #11 sprite process (scope bump).

Per the writing-plans skill, two ways to execute when you're ready:

1. Subagent-driven (recommended) — I dispatch a fresh subagent per task with review between.
2. Inline — I execute here in batches with checkpoints.

---

Prompt: Execute planning/issue-13-plan.md Subagent-driven — Claude will dispatch a fresh subagent per task. Pause for review between phases.

---

Phase 2 complete — pausing for your review

Commit 79e0ecf — "feat(jedi): render /jedi from jedi-api mock; add Cute category (#13)". Touched only src/routes/jedi.tsx + src/routes/jedi.test.tsx (verified via git show --stat).

Verification (implementer, re-checked by me):

- New jsdom test jedi.test.tsx — TDD RED→GREEN matched prediction exactly (1 failing "Cute sidebar" assertion before → 4/4 after).
- test:all 192/192, check + build ok. Grep guard clean — only the Hero backgroundImage URL remains hard-coded (intentionally out of scope).

Task review (sonnet, spec + quality): ✅ Spec compliant · Approved · 0 Critical, 0 Important.

- Confirmed every class/handler/aria-label preserved (only literals → jediApi accessors); createResource usage correct incl. dependent caption fetch keyed on featured()?.id; Cute now renders as both sidebar row and article chip.
- Its 2 ⚠️ "can't verify from diff" items (Phase-1 files) I resolved against the actual committed code: data.json:25 Cute id 6 + post 1 category_ids [3,6]; jedi-api.ts:62/73 ranks posts desc → featured=Little Jedi.
- 1 Minor, carried to the final review (not a defect): sidebar cards render an empty <ul> while a resource is pending/rejected — no loading/error state. It's the plan's verbatim mandated code → follow-up candidate (issue #29 / deferred scope).

---

Phase 3 Manual review complete. Updated and committed plan docs.

---

Final review (opus) returned: Ready to merge — With fixes (one trivial doc fix). No Critical. The single Important finding (sidebar cards lack loading/error + no ErrorBoundary) the reviewer itself triaged as an acceptable, correctly-deferred follow-up → #29 (reasoning: app.tsx Suspense masks the pending case; the static mock can't reject; plan defers polish to #29). The only pre-merge gate is a Minor broken ADR link in CONTEXT.md.
