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
