# Issue #17 — Grilling Session (RESUMABLE): Back-end expansion + mono-repo

> **Status:** ✅ **COMPLETE** — all decisions locked; ADRs 0008–0011 written; `CONTEXT.md` finalized.
> Remaining: create the 4 follow-on GitHub issues (awaiting user go-ahead — outward-facing).
> **Method:** `/grill-with-docs #17` — a `/grilling` session using `/domain-modeling`.
> Deliverable is docs (ADRs + `CONTEXT.md`), not code.

## How to resume

1. Re-run `/grill-with-docs #17` (or `/grilling`) and read this file first.
2. Skip locked decisions (D0–D3b below). Continue at the first **OPEN** branch (D4).
3. Facts already grounded are listed under "Grounded facts" — don't re-explore them.

## Repos

- **FE** (this repo): `/Users/glen/Documents/Development/Study/Javascript/SolidJS/SolidStart-Demo`
  SolidStart modular monolith. Surfaces: **Jedi** (home/shell, mock-backed) + **Realtime Conversations** (`fullstack.tsx`, wired to BE).
- **BE**: `/Users/glen/Documents/Development/Study/Rust/Rust_10X/rust-web-app`
  rust10x Axum JSON-RPC workspace. Registers `Agent`, `Conv`, `ConvMsg` only. Postgres-bound.

---

## Design tree + status

```
D0  Front-end strategy ......... LOCKED → (a) keep SolidStart; Leptos = trade-off ADR
D1  Naming (Jedi vs Awesome) ... LOCKED → keep "Jedi" code/domain; "Awesome" = brand string
D2a Contract direction ......... LOCKED → BE owns domain via ts-rs bindings; mock → fixture
D2b Like modeling .............. LOCKED → first-class records, 2 tables, unique(owner,target)
D2c-icon presentation .......... LOCKED → (iii) opaque BE string; FE narrows to IconName + fallback
D2c-Hero ....................... LOCKED → BE table, singleton mutable row, Admin-editable
D3a DB target .................. LOCKED → (A) SQLite-via-sqlx (PG ↔ SQLite, Turso-file-compatible)
D3b DB-swap mechanism .......... LOCKED → (i) feature flag; portable subset; default SQLite
D4a  Layout ................... LOCKED → (a) frontend/ + backend/
D4-1 Host repo + history ...... LOCKED → host=FE; preserve BE history (filter-repo → backend/)
D4-2 ts-rs binding path ....... LOCKED → (C) single source via tsconfig alias into backend/…/bindings
D4-3 Build orchestration ...... LOCKED → root Scripts.toml via cargo-run (cgs)
D4-4 Dev workflow (2 servers) . LOCKED → cgs dev (concurrently) + SQLite-default + self-booting e2e
D4-5a Root vs subtree placement  LOCKED → domain docs (CONTEXT+ADRs) at root, single-context; code/config → subtrees
D4-5b .gitignore/CLAUDE.md/editor LOCKED → nested .gitignore + light-split CLAUDE.md + root editor/CI
D4-6 CI ....................... LOCKED → full GH Actions workflow now; run-both; BE DB-matrix; e2e non-blocking
D5   Deliverable / sequencing . LOCKED → ADRs 0008–0011 written; CONTEXT finalized; issues 1–4 sequenced
```

---

## Locked decisions (with rationale)

### D0 — Front-end strategy → **(a) keep SolidStart**

Keep SolidStart/TS; expand Rust BE + mono-repo. Full-Rust/Leptos becomes a **documented trade-off study (ADR)**, not a rewrite.

- Why: project's declared purpose is a _SolidStart_ production reference (`CONTEXT.md:2-3`); a Leptos rewrite discards that + 7 FE ADRs. #17 frames Leptos as "trade-offs of switching" = analysis, not commitment. BE + mono-repo pay off under either stack.

### D1 — Naming → **keep "Jedi" as code/domain; "Awesome" = brand string only**

Not a pending rename — the split already exists in code: `Nav.tsx:34` `<span>Awesome</span>`, `index.tsx:32` title, ADR-0007 references the `"Awesome" nav`; but 35 files + CONTEXT + ADRs use **Jedi**.

- User note: separate code/brand names reduce clarity; any future Jedi→Awesome rename is **parked in #31** (alongside Agent→Channel).
- Recorded in `CONTEXT.md` Jedi section (`_Brand_:` note).

### D2a — Contract direction → **BE owns domain entities via ts-rs bindings; mock → fixture**

Mirror how Realtime Conversations already works (Rust entities → ts-rs bindings → FE barrel `src/types/backend/`, ADR-0003). The Jedi mock was purpose-built to become this (ADR-0002). ts-rs bindings regenerated **after BE domain is complete**. `data.json` is the model for the BE data.

### D2b — Like → **first-class records, two tables**

`post_like` / `caption_like`, each `{ id, owner_id, post_id|caption_id, ctime }`, **`unique(owner_id, target_id)`** (idempotent toggle). `like_count` is **derived** by counting rows — FE seam already returns it as a number, components unaffected. Two tables (not polymorphic FK) matches the rust10x BMC-per-entity pattern.

- Why over counter-only: CONTEXT ranks captions "by their own Likes"; competition UX + #17's e-commerce goal need per-user like records.
- Recorded in `CONTEXT.md` as new **Like** term.

### D2c-icon → **(iii) opaque BE `string`, FE narrows to `IconName` with fallback**

BE `Category = { id, name, icon: string }`. `icon` is an opaque key the BE never interprets; FE maps key→`IconName` (`Icon.tsx:20`) with a fallback. Keeps categories fully BE-owned for future dynamic taxonomy; makes the type honest at the barrel (same philosophy as ADR-0003). The `ICON_NAMES.toContain` test (`jedi-api.unit.test.ts:33`) relaxes to "known key or fallback."

### D2c-Hero → **BE table, singleton mutable row, Admin-editable**

`Hero { title, subtitle, ctaText, ctaHref, backgroundImage }` (`data.json` `hero`) becomes a BE-owned **singleton** row an **Admin user** edits to change home branding. Not `owner_id`-owned, not user-generated. FE renders via seam as `HeroView` (URLs sanitized).

- User override: rejected "Hero = FE config"; wants BE table "facilitating changes in Hero style and branding."
- Recorded in `CONTEXT.md` as new **Hero** term.

### D2c-Profile → **not a leak; it is the unified `User`**

`JediProfile { userId }` is the authenticated `User` — the _same_ identity that owns Conversations _and_ Posts/Captions/Likes (the convergence in `CONTEXT.md:22-24`, ADR-0007). One BE `User` entity spans both surfaces.

### D3a — DB target → **(A) SQLite-via-`sqlx`**

Swap Postgres ↔ SQLite via `sqlx-sqlite` (Turso/libSQL is SQLite-compatible; local dev uses a SQLite file sqlx opens natively). Preserves the sqlx-typed `Dbx`. True Turso/libSQL-remote (edge/replicas via the `libsql` crate — _not_ sqlx) is deferred to a **future third backend**.

### D3b — DB-swap mechanism → **(i) compile-time feature flag; portable-subset schema; default SQLite**

**Sub-decisions (all LOCKED):**

- **D3b-1 mechanism → (i) compile-time feature flag** (`--features postgres|sqlite`, mutually exclusive + `compile_error!` guard). One binary per backend.
- **D3b-2 schema/DDL → two hand-maintained SQL trees** (`sql/dev_initial/{pg,sqlite}/`), feature-selected. `dev_db.rs` branches the bootstrap: skip `00-recreate-db.sql` (PG-root `CREATE DATABASE`/`USER`) for sqlite, delete the `.db` file instead. Guard drift with a schema-parity test.
- **D3b-3 type parity → normalize to a portable subset**: enums → `TEXT` (+CHECK) on **both** (drop `#[sqlx(type_name=...)]`); salts app-generated on **both** (drop `gen_random_uuid()` default); `timestamptz` → `TEXT`/RFC3339. Single `FromRow` decode path; behavior identical across backends.
- **D3b-4 default → SQLite** (zero-infra dev, matches D3a + Turso "no server needed"); `--features postgres` for prod. **CI runs both** (matrix) — the only thing that makes the D3b-3 parity a guarantee.

**Seam design:** one `db_backend` cfg-module exports `Backend` (=`Postgres`|`Sqlite`), `Db`, `DbRow`, `query_builder()`, `new_db_pool()`. `dbx/mod.rs` + `crud_fns.rs` reference the aliases (collapses ~20 `Postgres`/`PgRow`/`PostgresQueryBuilder` mentions). That module _is_ the "module" #17 swaps.

**Why (i), and why the checkpoint's earlier framing was wrong:** the prior note separated the options on "keeps vs loses sqlx's compile-time typed queries." There are **none** — `grep -E 'sqlx::query(_as|_scalar)?!' = 0 matches`; every query is runtime sea-query `build_sqlx(PostgresQueryBuilder)` → `sqlx::query_as_with(&sql, values)` (`crud_fns.rs:37-41`). The real axis: sqlx is monomorphized **per `Database`** (`Pool<Postgres>`, `QueryAs<'q, Postgres,…>`, `FromRow<'r, PgRow>`), so a runtime swap needs enum-dispatch (ii, invasive) or `sqlx::Any` (iii). **(iii) is a dead end**: sea-query-binder's `SqlxValues` has no `Any` builder/args, so the entire `build_sqlx → query_as_with` crud layer would be abandoned; Turso-remote isn't an `Any` backend either. #17 says "swap a **module**" (compile-time leaning); we never need both backends live in one process.

**Cost — concentrated + mechanism-independent DDL:** `store/mod.rs` (pool type/options/connect), `dbx/mod.rs` (~10 `Postgres` → `Backend`), `crud_fns.rs`+`user.rs` (`PgRow` bound ×4, `PostgresQueryBuilder` ×9 → aliases), `dev_db.rs` (PG-root recreate + hardcoded URLs → cfg branch), Cargo features. Plus a SQLite DDL tree + app-side salt generation in `UserBmc::create` (needed regardless of mechanism).

**Future work (not blocking D3b):** query-DML dialect residue — `0` upsert/ILIKE today; the D2b idempotent Like needs `ON CONFLICT(owner_id,target_id) DO NOTHING` (portable pg+sqlite ≥3.35); any `contains`/`starts_with` search needs case-insensitive handling. Track in implementation issues.

**Turso local (verified):** plain SQLite file `local.db`, _"local database file, no server needed (recommended)"_ — sqlx opens it natively. `turso dev`/sqld (HTTP + libSQL client, **not** sqlx) stays the deferred "future third backend."

**ADR-ready:** hard-to-reverse (seam shape + schema normalization + PG-schema changes), surprising-without-context ("why gut PG enums / app-gen salts / one binary per backend?"), real trade-off (rejected runtime-trait, sqlx-Any, PG-idiomatic schema). Queue for D5 as the **DB-swap-seam ADR**.

### D4a — Layout → **(a) `frontend/` + `backend/`**

Two top-level dirs. Matches `CONTEXT.md:1` ("SolidStart Demo — Front-end") + the issue's front-end/back-end framing; framework-neutral (FE is one Bun package, not a JS workspace); each subtree keeps its toolchain intact; obvious `git subtree` prefix.

- Rejected `apps/{web,server}` (JS-workspace idiom we're not adopting; "future apps" speculative) and BE-`crates`-at-root + `web/` (buries FE).
- **Supersedes** the BE `planning/bun_vite+_monorepo.md` ("by Grok") plan, which put Cargo `crates/` at root with FE under `frontend/` (= rejected option c) and assumed a _fresh_ repo (`git init my-monorepo`, `bun create solid`, `cargo new`) — discarding 590 FE + 271 BE commits. We preserve history instead (see D4-1). That doc also assumed **Bun workspaces** (`"workspaces":["frontend"]`) — deferred until a real shared JS package exists (revisit at D4-3).

### D4-1 — Host repo + history → **host = FE (`SolidStart-Demo`); preserve BE history**

FE repo becomes the mono-repo (home of #17, `CONTEXT.md` + 7 ADRs, product identity); its files move to `frontend/` in one rename commit (git follows renames). BE (`rust-web-app`, 192/271 commits the user's own) imported to `backend/` **with history** — D3b rewrites that exact DB code, so blame is worth keeping.

- Mechanism (impl detail, not a locked sub-decision): `git filter-repo --to-subdirectory-filter backend/` on a BE clone, then merge `--allow-unrelated-histories` (rewrites paths → `git blame backend/…` works through history). `git subtree add --prefix=backend` = simpler fallback (awkward cross-boundary blame).
- `rust-web-app` remote goes dormant/archived after import.
- Rejected: fresh repo (Grok note — discards both histories); snapshot import of BE (drops 192 commits); host = BE.

### D4-2 — ts-rs binding path → **(C) single source of truth via tsconfig path alias**

Leave BE `TS_RS_EXPORT_DIR` unchanged (`backend/crates/services/web-server/bindings/`, 18 committed `.d.ts`). Delete the 10 duplicated `.d.ts` in `frontend/src/types/backend/`; rewrite the barrel `index.ts`'s 10 imports `./X.d` → alias (e.g. `~backend-bindings/X.d`) into that dir; add a `paths` entry in `frontend/tsconfig.json`; add the generated dir to FE lint/format ignore (outside `frontend/src`, so `vp check` already won't touch it). Barrel stays the sole public entry (`~/types/backend`); `NumericIds`, hand-authored types, and curation (skip the 8 Error types) preserved. Every consumer untouched.

- Why: kills duplicate files + drift (the mono-repo payoff); surgical FE change; scales to post-D2a Post/Caption growth with zero per-type work; committed bindings → FE typecheck needs no cargo build.
- Trade-off accepted: FE tsconfig reaches into `backend/…/bindings` (deliberate FE→BE source dep = the point of #17).
- Rejected: (A) automate-copy (keeps duplication + drift guard); (B) export into `frontend/src` (cargo mutates FE tree; oxfmt vs ts-rs format war; dumps 8 Error types).
- **D5 ADR candidate:** ADR-0003 rejected BE-side `#[ts(type="number")]` partly because "back-end is not in this repo" — premise now false. Keep `NumericIds` for now (pristine-generated-files reason still holds); log "revisit ADR-0003 id-representation".

### D4-3 — Build orchestration → **(3a) root `Scripts.toml` via `cargo-run`/`run-cargo-script` (`cgs`)**

A master `Scripts.toml` at the monorepo root defines cross-cutting recipes (`cgs dev`, `cgs build`, `cgs test`, `cgs check`, `cgs bindings`, …) that delegate to each subtree's native commands (`cd frontend && vpr …`, `cd backend && cargo …`). Zero new install (already used on the BE via `cgs`); language-neutral; continues the existing pattern.

- **Verified (evidence):** `run-cargo-script --help` = "npm scripts, make, or just — built for Rust"; reads `Scripts.toml` from cwd. Ran a recipe from a fresh non-Cargo tmp dir → works with **no `Cargo.toml`**, so a master file at the polyglot root is valid. `cgs` = the alias (zsh history). **No native parallel** — each recipe is one shell command (drives D4-4 run-both).
- **Layering by cwd:** root `cgs <task>` = both sides; `backend/Scripts.toml` `cgs <task>` = BE-only (kept — valid, NOT vestigial; earlier grounding corrected by user); `frontend/` `vpr <script>` = FE-only (kept). Backend recipes run from `backend/` (Cargo workspace root lives there per D4a).
- Rejected: `just` (new install; `cgs` fills the role), root `package.json`+`concurrently` (JS artifact at polyglot root; vp/vpr ambiguity), Bun workspaces (deferred), `make` (clunky).
- **Follow-on (D5):** BE `README.md` + `.claude/CLAUDE.md` are out of date → update during implementation.
- Context: `trunk` + `wasm-bindgen-test-runner` installed (Leptos/WASM FE toolchain present) — note for the D0 Leptos trade-off ADR.

### D4-4 — Dev workflow → **one-command run-both + SQLite-default + self-booting e2e**

- **(1) Run-both:** root `cgs dev` runs FE + BE via `concurrently` (`-k` kill-both, labeled `web`/`server`). `cgs` has no native parallel and root has no `node_modules`, so the recipe resolves the pinned `concurrently@10.0.3` from the FE (`cd frontend && bunx concurrently … "vpr dev" … "cd ../backend && cargo run -p web-server"`) — exact invocation is impl detail. Single-side kept: `frontend` `vpr dev`, `backend` `cgs dev`/`dev-watch`.
- **(2) Dev-DB:** SQLite default (D3b) → `cgs dev` needs no docker; `cgs db` (docker `postgres:17`) only to exercise the PG backend. SQLite = documented default dev path.
- **(3) e2e self-boot:** modify `src/lib/test-e2e.sh` so `cgs test:e2e` boots BE (SQLite, ephemeral file) + FE, then probes `:8080` for `401 NO_AUTH` — removing today's "BE must already be up" footgun (CLAUDE.md gotcha). Cheap once the DB is zero-infra; done as part of #17.

### D4-5a — Root vs subtree placement → **domain docs at root, single-context**

Only **code + tool-config** descend into `frontend/`/`backend/` (Cargo/vinxi/tsc resolve config from their own root — forced). The **shared domain model stays at the mono-repo root**: `CONTEXT.md` (one ubiquitous language spanning both surfaces) + `docs/adr/` (system-wide decision log; #17's new ADRs are cross-cutting/BE). **Single-context** — one root `CONTEXT.md`, no `CONTEXT-MAP.md`/per-subtree split (ADR-0007 convergence = one bounded context, two surfaces; BE has no glossary of its own).

- Root `README.md` = mono-repo overview (run both via `cgs`); subtree READMEs kept/refreshed.
- `planning/`: root = cross-cutting (this file, roadmap); imported BE notes stay `backend/planning/` (historical — incl. `full_stack_integration.md`, `leptos_axum_integration.md` = inputs for the D0 Leptos ADR).
- Grounded: FE has the only `CONTEXT.md` + 7 ADRs; BE has none.

### D4-5b — Dotfiles & tooling coexistence → **nested .gitignore + light-split CLAUDE.md + root editor/CI**

- **.gitignore nested** (decisive: BE `.gitignore` opens with `.*` = ignore all dotfiles, only `!.gitignore`/`!.claude` — hoisting would swallow root `.github`/`.vscode`/`.claude`). → `backend/.gitignore` (as-imported), `frontend/.gitignore`, thin root `.gitignore` (global only: `.DS_Store`, `.env`, OS/editor cruft). Git composes hierarchically.
- **CLAUDE.md light split:** root `.claude/CLAUDE.md` = cross-cutting (issue tracker, triage, domain pointer, "quote the code", "use concise") — always loaded; `frontend/CLAUDE.md` = FE tool rules (vpr, signal naming, Tailwind custom-prop, test layout) — loads on FE file access; `backend/CLAUDE.md` = BE rules. Rule of thumb: universal rules at root, specialize the rest.
- **Root editor/CI:** one root `.vscode/` (+ rust-analyzer `linkedProjects` → `backend/Cargo.toml`, not at repo root); one root `.github/`. Subtree `.vscode/` only for tool-specific needs.
- **Skills/grilling/docs unaffected:** global skills resolve from `~/.claude/skills`; project skills (`concise`, `solidjs-solidstart-expert`) + `.superpowers`/`.agents`/`skills-lock.json` stay at root `.claude/` → repo-wide. Grilling/domain-modeling key off root `CONTEXT.md`+`docs/adr/`. Daily change is the command surface (`cgs` at root; `cd` subtree for single-side), not the split.
- **Reconcile in impl:** root `.claude/settings.json`(+local) vs BE `.claude/settings.local.json`+`tasks.json`; BE `.aipack/` stays under `backend/`.

### D4-6 — CI → **full GitHub Actions workflow now; run-both-on-every-PR**

Greenfield (no existing workflows in either repo). One workflow, parallel jobs:

- **BE job:** `cargo fmt --check`, `clippy`, `nextest`, `build` under a **DB matrix `{sqlite, postgres}`** (SQLite native; PG via service container). Satisfies the D3b-4 mandate — the matrix _is_ the portability guarantee.
- **FE job:** `vp check` (NOT `vpr check` — avoids `--fix` mutations in CI), `vp test`, `vinxi build`.
- **Bindings-drift guard:** `cgs bindings` + `git diff --exit-code` (committed ts-rs bindings must match Rust types → protects D4-2 alias consumers).
- **e2e job:** self-booting (D4-4: SQLite BE + FE + Playwright), **non-blocking at first** (cold-CI flakiness).
- **Run-both-on-every-PR** (not path-filtered): D4-2 couples FE↔BE (a backend entity change regenerates bindings → FE typecheck must re-run), so naive `frontend/**` filters would miss breaks. Add path filters later if CI time hurts.
- Platform: GitHub Actions (host = `gihrig/SolidStart-Demo`).

### D5 — Deliverables / sequencing → **4 ADRs written; CONTEXT finalized; 4 issues sequenced**

- **ADRs written this session:** [0008](../docs/adr/0008-keep-solidstart-leptos-tradeoff.md) keep-SolidStart / Leptos study · [0009](../docs/adr/0009-db-swap-seam-postgres-sqlite.md) DB-swap seam · [0010](../docs/adr/0010-monorepo-structure.md) mono-repo structure · [0011](../docs/adr/0011-jedi-backend-domain-contract.md) Jedi BE contract. (Like folded into 0011, not split — user choice.)
- **CONTEXT.md finalized:** cross-refs added (Jedi intro → 0008/0009/0010/0011; Like & Hero → 0011; User "Converging" → 0011). Glossary bodies left intact — they still carry a few impl tokens (`post_like`/`caption_like`, `unique(...)`, `data.json`, `HeroView`); offered to strip to pure domain language if wanted.
- **Not ADRs:** D1 naming → CONTEXT Brand note + #31; ADR-0003 id-representation revisit → follow-on note only (keep `NumericIds`).
- **Implementation issues (order 1 → 2 → 3 → 4):**
  1. **Mono-repo merge** (D4) — filter-repo BE→`backend/`, FE→`frontend/`, root `Scripts.toml`, tsconfig bindings alias, nested `.gitignore`, CLAUDE.md split, root `.vscode`(+rust-analyzer `linkedProjects`)/`.github`, full CI, e2e self-boot, refresh BE README/CLAUDE.md.
  2. **DB-swap seam** (ADR-0009) — `db_backend` cfg-module, feature flags + `compile_error!` guard, dual DDL trees, portable-subset normalization, `dev_db.rs` branch, schema-parity test.
  3. **Jedi BE domain** (ADR-0011) — Post/Caption/Category/Comment/PostLike/CaptionLike/Hero + BMCs + RPCs + bindings; portable schema from the start.
  4. **FE integration** (thin slices) — 4a read-only Post feed → 4b categories/Top Photos → 4c captions/Top Captions → 4d likes (idempotent toggle) → 4e Hero admin.
- **Remaining:** create the 4 GitHub issues (awaiting user go-ahead).

---

## Emergent Jedi BE domain spec (to build after grilling)

New entities to add to the rust10x workspace (`lib-core` models + BMCs, `web-server` RPCs, ts-rs bindings):

| Entity          | Shape (domain fields; BE adds its audit columns by convention)                                           |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `User`          | **existing** rust10x User — unified identity across both surfaces                                        |
| `Post`          | `owner_id, title, image_src, image_alt, photographer, photographer_url, source_url, like_count(derived)` |
| `Caption`       | `post_id, owner_id, text, like_count(derived)`                                                           |
| `Category`      | `name, icon: String` (opaque key)                                                                        |
| `Comment`       | `post_id, owner_id, body`                                                                                |
| `PostLike`      | `owner_id, post_id, ctime` · `unique(owner_id, post_id)`                                                 |
| `CaptionLike`   | `owner_id, caption_id, ctime` · `unique(owner_id, caption_id)`                                           |
| `Hero`          | singleton: `title, subtitle, cta_text, cta_href, background_image` · Admin-editable                      |
| `post_category` | join table, many-to-many (`Post.category_ids`)                                                           |

**Not BE:** `Hero` _is_ BE (decided); `IconName` mapping stays FE; `Top Photos`/`Top Captions` are derived views (not tables).

---

## CONTEXT.md updates made this session

- Jedi section: added `_Brand_:` note (Awesome = brand, Jedi = code; not a rename; alignment parked in #31).
- Added **Like** glossary term (first-class, 2 tables, derived count).
- Added **Hero** glossary term (BE singleton, Admin-editable).
- **D3b → no CONTEXT.md change** (intentional): the DB-swap mechanism is architecture (ADR territory), not glossary. CONTEXT.md stays implementation-free per domain-modeling.

---

## Grounded facts (don't re-explore)

**FE**

- `CONTEXT.md:2-3` purpose = SolidStart production reference; `:22-24` unified identity convergence at #17/ADR-0007.
- Jedi mock: `src/lib/jedi/data.json` (users/categories/posts/captions/comments/hero/profile), seam `src/lib/jedi/jedi-api.ts`, types `src/types/jedi.ts`.
- `likeCount` stored as bare int, no likes collection (`data.json:38,83`).
- `profile.userId:3` = current-user stand-in.
- `IconName = (typeof ICON_NAMES)[number]` (`Icon.tsx:20`); test asserts icons ∈ ICON_NAMES (`jedi-api.unit.test.ts:33`); FE synth "All" pseudo-category (`createJediFeed.ts:52`).
- ts-rs binding pattern + numeric-id barrel: ADR-0003, barrel `src/types/backend/index.ts`.

**BE** (`rust-web-app`)

- Workspace: `lib-utils, lib-rpc-core, lib-auth, lib-core, lib-web`, service `web-server`, tool `gen-key`.
- RPC surface: `Agent` (`.../rpcs/agent_rpc.rs`), `Conv`/`ConvMsg` (`.../rpcs/conv_rpc.rs`). No Post/Caption yet.
- **DB seam (key for D3b):** `Postgres` threaded through the whole query API:
  - `lib-core/src/model/store/mod.rs:11` `pub type Db = Pool<Postgres>;`
  - `lib-core/src/model/store/dbx/mod.rs`: `Transaction<'static, Postgres>` (:35), `QueryAs<'q, Postgres, O, A>` (:137), `Query<'q, Postgres, A>` (:201).
  - `Cargo.toml` `sea-query-binder = { features = ["sqlx-postgres", "with-time", "with-uuid"] }`, `modql { with-sea-query }`.
- README already anticipates Leptos (`[profile.wasm-release]`) + has `web-folder/index.html`.

**BE — D3b grounding (decisive)**

- **No sqlx compile-time macros:** `grep -E 'sqlx::query(_as|_scalar)?!' crates = 0`. All queries are runtime: `build_sqlx(PostgresQueryBuilder)` → `sqlx::query_as_with`/`query_with` (`crud_fns.rs:37,76,103,181,247,273,307`; `user.rs:183,227`; `count` uses `to_string(PostgresQueryBuilder)` + `sqlx::query` at `crud_fns.rs:212-214`).
- **PG coupling leaks past `Dbx`:** generic bound `E: FromRow<'r, PgRow>` in `get`/`first`/`list` (`crud_fns.rs:92,126,163`), not just the pool.
- **Enums are PG-named-type on decode:** `#[sqlx(type_name="user_typ")]` (`user.rs:21`), `"conv_kind"`/`"conv_state"` (`conv.rs:33,75`). Write path already portable: `impl From<UserTyp> for sea_query::Value { to_string().into() }` (`user.rs:28-30`).
- **Salts rely solely on DB default:** `gen_random_uuid()` only in DDL; no app-side salt gen (`Uuid::new_v4()` is request-id middleware only); `UserForInsert { username }` inserts username only (`user.rs:49-52`).
- **DDL PG-isms** (`sql/dev_initial/01-create-schema.sql`): `BIGINT GENERATED BY DEFAULT AS IDENTITY (START WITH 1000)`, `CREATE TYPE … AS ENUM`, `uuid DEFAULT gen_random_uuid()`, `timestamp with time zone`. `00-recreate-db.sql` = `CREATE DATABASE`/`USER`/`pg_terminate_backend` (no SQLite analog). `dev_db.rs` hardcodes PG URLs + `Pool<Postgres>` (`:11,14-15,99`), splits files on `;` (`:86`).
- **Turso local verified:** plain `local.db` file, "no server needed (recommended)"; sqlx-native. `turso dev`/sqld = libSQL client over HTTP (not sqlx) → deferred third backend.

---

## OPEN branches — resume framing

### D3b — DB-swap mechanism → **RESOLVED** (see Locked decisions). ADR-ready (DB-swap-seam, queued for D5).

### D4 — Mono-repo structure (RESUME HERE)

Merge FE (Bun/Vite) + BE (Cargo) into one repo. To resolve: layout (top-level `apps/` or `frontend/`+`backend/`?), build orchestration (root scripts calling `vpr` + `cargo`), CI, config-file placement, ts-rs binding output path crossing the seam, dev workflow (run both servers), `.gitignore`/tooling coexistence.

### D5 — Deliverable / sequencing

ADRs to emit (candidates): keep-SolidStart-vs-Leptos trade-off; Jedi BE domain contract; Like-as-entity; icon-opaque-at-barrel; DB-swap seam; mono-repo layout. Plus follow-on implementation issues + build-increment order (recommend thin vertical slice: read-only Post feed first).
