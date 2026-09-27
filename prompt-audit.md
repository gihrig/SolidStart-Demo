# Prompt audit — manual actions

Audit date: 2026-09-23. Target model: Claude Opus 5.5 (`claude-opus-5-5`).
Prompt: /claude-api prompt-audit
The audit patch (findings H1–H4, M1–M11) is applied to the working tree.
This file lists the actions that the patch did not do.

## 1. Verify the applied changes

Test the changes one at a time in a new Claude Code session.
If a change causes a regression, add the rule back in a short form. Do not restore the old wording.

- [x] **M1, M2 — `concise` skill.** Ask a question that needs code evidence.
      Expected: the answer quotes the code and is not cut to 2–3 sentences.
      Expected: the answer uses full grammar.
- [x] **M3 — decision reasons.** Ask for a change that needs a design choice.
      Expected: Claude gives the reason for the choice in one line.
- [x] **M4 — status lines.** Watch the status lines during a multi-step task.
      Expected: "Reading…", "Checking…", not "Let me read…".
- [x] **H1 — terminology.** Ask about a refactor of previously existing code.
      Expected: Claude writes "existing code", not "exiting code" and not "hand written".
- [x] **M7 — complete code.** Ask for a one-line change in a front-end component.
      Expected: Claude uses Edit (a targeted change), not Write (a full-file rewrite).
      Expected: no `// ...rest unchanged` placeholders in any code Claude shows.
- [x] **M9 — Rust modules.** Ask for a new Rust module with no child modules.
      Expected: Claude creates `foo.rs`, not `foo/mod.rs`.
- [x] **M11 — SolidJS skill trigger.** Start a SolidJS task in `frontend/`.
      Expected: the `solidjs-solidstart-expert` skill still loads. Refactored in 2 below.

## 2. Protect the vendored skill edit (M11)

The patch changed the `description` in
`frontend/.agents/skills/solidjs-solidstart-expert/SKILL.md`.
That skill comes from `modra40/claude-codex-skills-directory`, and `frontend/skills-lock.json` pins its `computedHash`.

- [x] Decide how to keep the edit. A skill re-install or update can overwrite it.
- [x] If your skills tool verifies the hash, update `computedHash` or record the local change.

## 3. Low-confidence findings (not in the patch)

Decide on each item. Test before you remove text.

- [x] **L1 — TanStack sections.** `frontend/.agents/skills/solidjs-solidstart-expert/SKILL.md:161-334`
      show TanStack Query, Table, and Form. `frontend/package.json` has no TanStack dependency.
      Claude can copy these examples into project code. Remove or move them if Claude suggests TanStack. - Moved to root. See 2. above. - Keep TanStack example for future use.
- [ ] **L2 — invalid Rust layout example.** `.claude/skills/rust-clean-architecture/SKILL.md:31-33`
      shows `calc/lib.rs` ("Library root") inside `src/`. A `lib.rs` is the root file of a crate, not a sub-directory file.
      Correct the example, or remove the `calc/` entry.
- [ ] **L3 — garbled sentence.** `frontend/.claude/CLAUDE.md:75`:
      `vp check (with --fix) — replaces ESLint + Prettier corrects errors`.
      Rewrite it to say what you mean.
- [ ] **L4 — `concise` routing stated three times.** `.claude/CLAUDE.md:19`, `.claude/CLAUDE.md:25`
      (`- Use \`concise\` to communicate`), and `.claude/skills/concise/SKILL.md:3`.
      The three agree, so this is optional. Keep one copy if you want less text.

## 4. Out-of-scope items

- [ ] **Archive notes.** `frontend/planning/archive/plan_steps_ignored.md:2818` and `:3242` use "exiting" for "existing".
      These are archive notes, not instructions. Correct them only if Claude reads that archive.
- [ ] **Global instructions.** `~/.claude/CLAUDE.md` requires a code quote for every claim.
      The patched `concise` skill now agrees with that rule. No action is necessary unless you change either file.

## 5. Commit

- [ ] Review `git diff` for the 7 audited files.
      `.claude/settings.json` was already modified before the audit. Commit it separately.
- [ ] Commit the audit changes and this file, or delete this file when the actions are done.

## 6. Repeat the audit

- [ ] Run `/claude-api prompt-audit` again at the next model release.
      A rule that helps one model can become an obstacle for the next model.
- [ ] Update README.md with an Agent maintenance section. List passages that apply to future prompt audits.
