# SolidStart Demo — Mono-repo

A SolidJS/SolidStart front-end (`frontend/`) and a Rust/Axum back-end
(`backend/`) in one repo (ADR-0010).

- Shared domain model: [`CONTEXT.md`](CONTEXT.md) and [`docs/adr/`](docs/adr/).
- Front-end guide: [`frontend/README.md`](frontend/README.md).
- Back-end guide: [`backend/README.md`](backend/README.md).
- Command surface: run `cgs` at the repo root for the cross-cutting recipes.

## Security scanning

The project scans dependencies for known vulnerabilities and policy breaks
(ADR-0022). The commands sit in two scopes: **Global** and **Back-end**. Run each
command from the directory its heading names.

### Global — run from the repo root

The SBOM, the `grype` gate, and the audit recipes cover both subtrees.

The SBOM is one file, `/sbom.cdx.json`. It lists every Rust and TypeScript
dependency in CycloneDX format. `syft` writes it; `grype` scans it.

| Command          | What it does                                                       |
| ---------------- | ------------------------------------------------------------------ |
| `cgs sbom`       | Regenerate `/sbom.cdx.json` from the lockfiles.                    |
| `cgs sbom:check` | Verify `/sbom.cdx.json` is current (CI drift guard).              |
| `cgs scan`       | Scan `/sbom.cdx.json` with grype; fail on a high/critical finding. |

The audit recipes run each subtree's native advisory scan from the repo root.
Each delegates into the subtree, so you never change directory.

| Command        | What it does                                                                 |
| -------------- | ---------------------------------------------------------------------------- |
| `cgs audit`    | Audit both subtrees (front-end `bun audit`, then back-end `cargo-audit`).    |
| `cgs audit:fe` | Audit front-end dependencies (`bun audit`).                                  |
| `cgs audit:be` | Audit back-end dependencies (`cargo audit --deny warnings`).                 |

**Exit-code note.** `bun audit` (via `cgs audit:fe`) exits `1` on any finding, at
any severity. `cgs audit` joins the two sides with `;`, so both always run, but
its exit code reflects only the back-end. Use `cgs audit:fe` or `cgs audit:be`
when you need a per-side exit code, such as in a gate.

A VEX file, `/vex.openvex.json`, records accepted or not-affected findings so
the gate can pass. Maintain it with these recipes:

| Command         | What it does                                              |
| --------------- | --------------------------------------------------------- |
| `cgs vex`       | Show the VEX maintenance cheat-sheet.                     |
| `cgs vex:check` | Verify every VEX statement still matches a finding (CI).  |
| `cgs vex:add`   | Append a VEX statement (`-e VEX_PRODUCT=… -e VEX_VULN=…`).|
| `cgs vex:rm`    | Remove a VEX statement by advisory id (`-e VEX_VULN=…`).  |

**Exit-code note.** `grype` exits `2` when it finds a high or critical
vulnerability. The common assumption of exit `1` is wrong. The `cgs scan`
wrapper (`scripts/grype-scan.sh`) reads that `2` and fails the gate.

### Back-end — run from `backend/`

The back-end RustSec gate is `cgs audit:be` from the root (above), or `cgs audit`
from `backend/`. These recipes have no root delegate; run them from `backend/`.

| Command     | What it does                                                                       |
| ----------- | ---------------------------------------------------------------------------------- |
| `cgs deny`  | Dependency-policy gate: `licenses`, `bans`, `sources` from `backend/deny.toml`.    |

The back-end also adds these crates. A **report** surfaces findings but does not
block a merge. A **build integration** embeds the dependency list in the release
binary.

| Command          | Crate           | Role              | What it does                                                              |
| ---------------- | --------------- | ----------------- | ------------------------------------------------------------------------- |
| `cgs udeps`      | cargo-udeps     | report            | List unused dependencies (needs nightly).                                 |
| `cgs geiger`     | cargo-geiger    | report            | Count `unsafe` code in `web-server` and its deps.                         |
| `cgs release`    | cargo-auditable | build integration | Build the release binary with the embedded list (does not gate).          |
| `cgs auditable`  | cargo-auditable | build integration | Build with the embedded list, then read it back (fails on a RustSec advisory).|

## Where the scans run

Four surfaces run the scans. Each surface has a clear job.

1. **Local.** A developer runs a `cgs` recipe above by hand, at any time.
2. **Pre-push.** A git hook (`frontend/.vite-hooks/pre-push`) runs the `grype`
   gate over the pushed SBOM before a push leaves the machine. It runs offline
   and blocks a push on a high/critical finding. Bypass in an emergency with
   `git push --no-verify`. This is a convenience gate; CI is the real gate.
3. **PR.** GitHub Actions (`.github/workflows/ci.yml`) runs every gate on each
   pull request: `sbom-drift`, `grype-scan`, `cargo-audit`, `cargo-deny`, and
   the report-only jobs (`cargo-udeps`, `cargo-geiger`, `cargo-auditable`).
4. **Daily schedule.** A cron trigger (`17 6 * * *`) re-runs only `cargo-audit`
   and `grype-scan`. A newly disclosed advisory can trip an unchanged lockfile,
   so these two gates run daily; every other job is guarded PR/push-only.
