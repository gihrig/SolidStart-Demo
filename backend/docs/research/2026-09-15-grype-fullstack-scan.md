# Full-stack vulnerability scanning with Syft + Grype

**File:** `backend/docs/research/2026-09-15-grype-fullstack-scan.md`
**Date:** 2026-09-15
**Scope:** One project-wide SBOM (`syft`, CycloneDX 1.6 JSON) covering **both** the
Rust/Cargo backend and the TypeScript/npm frontend, scanned by **`grype`**. Snyk is
abandoned (`snyk sbom test` is Enterprise-only — see the sibling file
`2026-09-15-rust-sbom-snyk.md`, which this cross-references but does not replace).
**Versions verified today:** `grype` **v0.118.0** (2026-08-27) and `syft` **v1.51.1**
(2026-08-27), both the current `latest`. [[G-REL]][G-REL][[SY-REL]][SY-REL]

> Method note: every factual claim is cited inline to a primary source (Anchore's own
> docs/source, GitHub/RustSec docs). Load-bearing behaviour (exit codes, severity order,
> SBOM churn) is quoted **verbatim from the tool's source at the pinned release tag**.
> Where two official docs disagreed, the source code was treated as authoritative and the
> disagreement is called out. Anything not confirmable from a primary source is flagged.

---

## Summary & recommendation

- **grype scans a syft SBOM directly** — `grype sbom:sbom.cdx.json` — and auto-detects
  Syft-JSON, SPDX (JSON/XML/tag-value) and CycloneDX (JSON/XML). No re-scan of source
  needed. [[G-SCAN]][G-SCAN][[G-SRC-ROOT]][G-SRC-ROOT]
- **grype is the gate; syft is not.** syft only inventories packages (no pass/fail).
  grype fails the build via `--fail-on <severity>` over the ordered levels
  `negligible < low < medium < high < critical` ("at or above"). [[G-CONFIG]][G-CONFIG][[G-SRC-SEV]][G-SRC-SEV]
- **Exit codes (important, and mis-documented):** grype returns **`2`** when a vuln at or
  above the `--fail-on` severity is found — **not `1`**. `1` is any other error, `100`
  means a DB upgrade is available (`db check`), `0` is success. One official doc page
  wrongly says "return code will be 1"; grype's own source says `2`. [[G-SRC-CLI]][G-SRC-CLI]
- **One run is a true full-stack scan.** grype ships both a `rust` matcher and a
  `javascript` matcher (wired into the default matcher set), and syft catalogs `Cargo.lock`
  plus npm lockfiles. [[G-SRC-ROOT]][G-SRC-ROOT][[G-ALLPKGS]][G-ALLPKGS]
- **DB sources:** GitHub Security Advisories (GHSA), NVD and distro feeds via Vunnel /
  grype-db. There is **no standalone RustSec provider** — Rust vulns reach grype through
  GHSA, and **GHSA imports the RustSec database**. But `cargo-audit` reads RustSec
  *directly* and adds `unmaintained`/`unsound`/`notice`/yanked advisories grype does not
  carry, so **the two are complementary — keep both.** [[G-DBARCH]][G-DBARCH][[GHSA]][GHSA][[RUSTSEC]][RUSTSEC]
- **Install & network:** curl / brew / docker. grype checks for and downloads a DB update
  on **every run by default**; after the first download the DB is cached
  (`~/.cache/grype/db`) and you can run offline (`GRYPE_DB_AUTO_UPDATE=false`) or air-gap
  via `grype db import`. Because of DB load + matching cost, run it at **pre-push / CI**,
  not on every `pre-commit`. [[G-INSTALL]][G-INSTALL][[G-CONFIG]][G-CONFIG][[G-DBARCH]][G-DBARCH]
- **syft CycloneDX churns every run:** a random `serialNumber` and a `time.Now()`
  `metadata.timestamp` change on every invocation even with unchanged deps, and syft has
  **no `SOURCE_DATE_EPOCH` / normalize flag** yet (feature request open). Strip those two
  fields (e.g. with `jq`) before committing/diff-checking the SBOM. [[SY-SRC-FMT]][SY-SRC-FMT][[SY-3931]][SY-3931]
- **Official GitHub Actions exist:** `anchore/sbom-action` (syft) and `anchore/scan-action`
  (grype). [[SBOM-ACTION]][SBOM-ACTION][[SCAN-ACTION]][SCAN-ACTION]

Full command sequence is at the end.

---

## Q1 — grype scanning a syft SBOM (input + formats)

**Yes.** grype reads a pre-generated SBOM instead of re-analysing source. The `sbom:`
scheme is documented in grype's own root command help, verbatim [[G-SRC-ROOT]][G-SRC-ROOT]:

```text
sbom:path/to/syft.json                 read Syft JSON from path on disk
```

The Supported Scan Targets guide gives the exact commands and the full accepted-format
list, verbatim [[G-SCAN]][G-SCAN]:

```text
grype sbom:sbom.json      # explicit SBOM prefix
grype sbom.json           # implicit detection
syft alpine:latest -o json | grype   # pipe from syft
cat sbom.json | grype     # from a file via stdin
```

> "Grype automatically detects the SBOM format. Supported formats include:
> - Syft JSON
> - SPDX JSON, XML, and tag-value
> - CycloneDX JSON and XML" [[G-SCAN]][G-SCAN]

So the project-wide **CycloneDX 1.6 JSON** produced by syft is accepted directly.
(The sibling file confirms syft's `cyclonedx-json` defaults to CycloneDX **1.6**.
[[REF-SNYK]][REF-SNYK])

**Version constraints:** *Not confirmable from a primary source.* The scan-targets and
CLI reference pages state format support but document **no minimum CycloneDX/SPDX spec
version**; grype relies on syft's decoders. The syft default (CDX 1.6, SPDX 2.3) is
accepted, so no version pinning is required for this workflow.

---

## Q2 — Fail-gating & exit codes (the direct question)

### syft does not gate

syft is an inventory/SBOM generator; it has no severity threshold and no pass/fail
concept. Gating is entirely grype's job. (This is why the decision is "syft **+** grype":
syft builds the bill of materials, grype evaluates it.) [[REF-SNYK]][REF-SNYK][[G-SCAN]][G-SCAN]

### `--fail-on <severity>`

From the Configuration Reference, verbatim [[G-CONFIG]][G-CONFIG]:

> `fail-on-severity` — env `GRYPE_FAIL_ON_SEVERITY` —
> "upon scanning, if a severity is found at or above the given severity then the return
> code will be 1"
> accepted values: `negligible, low, medium, high, critical`

The CLI flag is `--fail-on` (alias `-f`). The **ordered** severity levels come straight
from grype's source, `grype/vulnerability/severity.go`, verbatim [[G-SRC-SEV]][G-SRC-SEV]:

```go
const (
	UnknownSeverity Severity = iota
	NegligibleSeverity
	LowSeverity
	MediumSeverity
	HighSeverity
	CriticalSeverity
)
```

with ranking `func (s Severities) Less(i, j int) bool { return s[i] < s[j] }`. So the
order is **negligible < low < medium < high < critical**, and `--fail-on high` fails on
**high and critical** (the "at or above" rule). [[G-SRC-SEV]][G-SRC-SEV][[G-CONFIG]][G-CONFIG]

When the threshold is met, the matcher returns `grypeerr.ErrAboveSeverityThreshold`,
which grype's root command propagates rather than swallowing, verbatim
[[G-SRC-ROOT]][G-SRC-ROOT]:

```go
remainingMatches, ignoredMatches, err := vulnMatcher.FindMatchesContext(ctx, packages, pkgContext)
if err != nil {
	if !errors.Is(err, grypeerr.ErrAboveSeverityThreshold) {
		return err
	}
	errs = appendErrors(errs, err)
}
```

### Exit codes — resolved from source (docs disagree)

Two official doc pages **contradict** each other: the Configuration Reference says the
`fail-on` return code is **`1`** [[G-CONFIG]][G-CONFIG]; the CLI Reference says it sets
"the return code to 2" [[G-CLI]][G-CLI]. The **source is authoritative**. grype maps
errors to exit codes in `cmd/grype/cli/cli.go` (verified at tag **v0.118.0**), verbatim
[[G-SRC-CLI]][G-SRC-CLI]:

```go
WithMapExitCode(func(err error) int {
	// return exit code 2 to indicate when a vulnerability severity is discovered
	// that is equal or above the given --fail-on severity value.
	if errors.Is(err, grypeerr.ErrAboveSeverityThreshold) {
		return 2
	}
	// return exit code 100 to indicate a DB upgrade is available (cmd: db check).
	if errors.Is(err, grypeerr.ErrDBUpgradeAvailable) {
		return 100
	}
	return 1
})
```

(The default-of-1 comes from the clio framework grype embeds — `exitCode = 1` on any
returned error, overridable via this `MapExitCode` hook. [[CLIO]][CLIO])

**Authoritative exit-code table:**

| Code | Meaning |
|------|---------|
| `0`  | success — scan completed; no vuln at/above the `--fail-on` severity (or `--fail-on` unset) |
| `2`  | **vulnerabilities found at or above the `--fail-on` severity** (the gate) |
| `100`| a DB upgrade is available (surfaces via `grype db check`) |
| `1`  | any other error (bad input, DB load failure, etc.) |

**Gotcha for CI/hooks:** the widely-copied assumption "grype exits 1 on findings" is
**wrong** for the `--fail-on` gate — it exits **`2`**. A step that treats only `1` as
"vulns found" will misclassify. In practice, any non-zero fails the step, but to
distinguish *findings* (`2`) from a *tool/infra error* (`1`), check the specific code.
Also note: **without `--fail-on`, grype exits `0` even when vulnerabilities are reported**
(it just prints them) — the threshold is what makes findings fail the build.
[[G-SRC-CLI]][G-SRC-CLI][[G-SRC-ROOT]][G-SRC-ROOT]

---

## Q3 — Ecosystem coverage (Rust + npm in one run)

**Confirmed for both.** grype's default matcher set imports and wires **both** a `rust`
and a `javascript` matcher — verbatim from `cmd/grype/cli/commands/root.go`
[[G-SRC-ROOT]][G-SRC-ROOT]:

```go
"github.com/anchore/grype/grype/matcher/javascript"
"github.com/anchore/grype/grype/matcher/rust"
...
Rust:       rust.MatcherConfig(opts.Match.Rust),
Javascript: javascript.MatcherConfig(opts.Match.Javascript),
```

The `grype/matcher/` directory contains subpackages including `rust` and `javascript`
(alongside `apk`, `dpkg`, `golang`, `java`, `python`, `ruby`, `rpm`, `hex`, `dotnet`,
`stock`, …). [[G-MATCHERDIR]][G-MATCHERDIR]

On the inventory side, syft (which grype uses for cataloging) provides the matching
package data. From the capabilities reference [[G-ALLPKGS]][G-ALLPKGS]:

- **Rust:** `rust-cargo-lock-cataloger` reads `Cargo.lock`.
- **JavaScript/npm:** `javascript-lock-cataloger` reads `package-lock.json`, `yarn.lock`,
  `pnpm-lock.yaml`; `javascript-package-cataloger` reads `package.json`.

syft emits `pkg:cargo` purls for Rust packages (established in the sibling file via
`packageurl.TypeCargo`) and `pkg:npm` for npm packages; grype's rust/javascript matchers
consume those. So **one grype run over the project-wide SBOM scans both ecosystems** —
a genuine full-stack scan. [[REF-SNYK]][REF-SNYK][[G-ALLPKGS]][G-ALLPKGS]

---

## Q4 — DB data sources & RustSec overlap (is `cargo-audit` redundant?)

### What grype's DB ingests

grype loads a prebuilt DB (`grype-db`) whose upstream data is normalised by **Vunnel**.
From the grype-db architecture doc, the listed providers are **Alpine, Amazon, Debian,
GitHub, NVD** (and the text names "canonical, redhat, debian, NVD, etc"). Vunnel "takes
the upstream vulnerability data (from canonical, redhat, debian, NVD, etc), processes it,
and writes the results." [[G-DBARCH]][G-DBARCH] The Vunnel `github` provider consumes GHSA
advisories generically by ecosystem (it iterates `advisory.ecosystems` rather than a
hard-coded subset). [[VUNNEL]][VUNNEL] **No standalone RustSec provider is documented.**
[[G-DBARCH]][G-DBARCH]

### Where Rust coverage comes from

Rust/cargo advisories reach grype **via GHSA (the GitHub provider)**. The GitHub Advisory
Database supports the **Rust (crates.io)** and **Npm** ecosystems, and — crucially — lists
its data sources verbatim as including **"The RustSec Advisory database"** [[GHSA]][GHSA]:

> "Rust (registry: https://crates.io/)" … "Npm (registry: https://www.npmjs.com/)"
> Sources: "Security advisories reported on GitHub; The National Vulnerability database;
> The npm Security advisories database; … The RustSec Advisory database; Community
> contributions."

And RustSec confirms the export direction, verbatim [[RUSTSEC]][RUSTSEC]:

> "The RustSec Advisory Database is a repository of security advisories filed against Rust
> crates published via https://crates.io." … "All our data is available on osv.dev" …
> "GitHub Advisory Database imports our advisories."

So grype's Rust *vulnerability* coverage transitively includes RustSec-sourced advisories
(RustSec → GHSA → grype-db → grype). *Confidence note:* this is a well-cited **chain**;
I did not find a single Anchore page that states verbatim "grype's DB contains cargo
advisories," but the chain (grype-db uses GitHub/GHSA + GHSA imports RustSec + grype ships
a rust matcher) is solid.

### Why `cargo-audit` still adds value (not redundant)

`cargo-audit` reads the **RustSec Advisory Database directly** (`cargo install cargo-audit`;
`cargo audit`). [[CARGO-AUDIT]][CARGO-AUDIT] RustSec carries advisory kinds beyond CVE-style
vulnerabilities — verbatim [[RUSTSEC]][RUSTSEC]:

> "unsound" (soundness issues), "unmaintained" (crates no longer maintained),
> "notice" (other informational notices).

These **informational** advisories (plus yanked-crate detection) are generally **not**
carried by GHSA/grype as security vulnerabilities, so a grype-only pipeline will miss
"crate X is unmaintained/unsound." Reading RustSec at the source can also surface a brand-
new advisory before it is imported into GHSA and rebuilt into grype-db (a reasonable
inference from the import + daily-rebuild pipeline, not a benchmarked claim).

**Verdict:** grype (GHSA/NVD) and cargo-audit (RustSec-direct) **overlap on Rust CVEs but
are not equivalent**. Keep **both**: grype for one full-stack CVE gate, `cargo-audit` for
Rust-specific `unmaintained`/`unsound`/`notice`/yanked coverage. They are complementary,
not redundant. [[GHSA]][GHSA][[RUSTSEC]][RUSTSEC][[CARGO-AUDIT]][CARGO-AUDIT]

---

## Q5 — Install, network, offline, and hook suitability

### Install (from the Installing Grype doc, verbatim) [[G-INSTALL]][G-INSTALL]

```bash
# install script
curl -sSfL https://get.anchore.io/grype | sudo sh -s -- -b /usr/local/bin

# Homebrew
brew tap anchore/grype
brew install grype

# Docker
docker pull anchore/grype
```

Also documented: Arch (`pacman -S grype-bin`), MacPorts, Winget, Scoop, Snapcraft, and
raw GitHub-release binaries. [[G-INSTALL]][G-INSTALL] (syft installs analogously via
`curl -sSfL https://get.anchore.io/syft | ...` — see the sibling file. [[REF-SNYK]][REF-SNYK])

### Network / DB behaviour

grype scans against a **local vulnerability DB** and, by default, checks for and downloads
an update **on every run**. From the DB guide, verbatim [[G-DBGUIDE]][G-DBGUIDE]:

> "When Grype is launched, it checks for an existing vulnerability database, and looks for
> an updated one online. If available, Grype will automatically download the new database."
> "Grype will automatically fail scans if the vulnerability database is more than 5 days old."

Config controls (defaults) [[G-CONFIG]][G-CONFIG]:

| key | env | default |
|---|---|---|
| `auto-update` | `GRYPE_DB_AUTO_UPDATE` | `true` (check for update each run) |
| `cache-dir` | `GRYPE_DB_CACHE_DIR` | `~/.cache/grype/db` |
| `update-url` | `GRYPE_DB_UPDATE_URL` | `https://grype.anchore.io/databases` |
| `validate-age` | `GRYPE_DB_VALIDATE_AGE` | `true` |
| `max-allowed-built-age` | `GRYPE_DB_MAX_ALLOWED_BUILT_AGE` | `120h0m0s` (5 days) |
| `require-update-check` | `GRYPE_DB_REQUIRE_UPDATE_CHECK` | `false` |

The DB auto-update is threaded through the scan in source:
`grype.LoadVulnerabilityDB(opts.ToClientConfig(), opts.ToCuratorConfig(), opts.DB.AutoUpdate)`.
[[G-SRC-ROOT]][G-SRC-ROOT]

### Offline / air-gapped

- **First run needs network** to fetch the DB. After that the DB is cached at
  `~/.cache/grype/db`; set `GRYPE_DB_AUTO_UPDATE=false` to scan without touching the
  network. [[G-CONFIG]][G-CONFIG][[G-DBGUIDE]][G-DBGUIDE]
- **Air-gap:** `grype db import` imports a DB archive "from a local FILE or URL"; archives
  come from `grype.anchore.io/databases`. [[G-CLI]][G-CLI] The architecture doc, verbatim:
  "the DBs can be stored separately, replaced with a service returning the distribution
  file contents, or mirrored for systems behind an air gap." [[G-DBARCH]][G-DBARCH]
- DB subcommands: `grype db update | check | status | list | import | delete | search |
  providers`. [[G-CLI]][G-CLI]

### Pre-commit vs pre-push/CI

*Recommendation (engineering judgment from the documented behaviour, not a benchmark):*
a full grype scan loads a multi-hundred-MB DB and, by default, hits the network to check
for updates on every invocation — too heavy for a per-commit hook. Prefer **pre-push** or
**CI**. If you must run it in a hook, (a) scan the already-generated SBOM (`grype sbom:…`)
rather than the source tree, and (b) set `GRYPE_DB_AUTO_UPDATE=false` so it uses the cached
DB and does no network I/O per commit. [[G-DBGUIDE]][G-DBGUIDE][[G-CONFIG]][G-CONFIG]

---

## Q6 — syft CycloneDX timestamp/serialNumber churn (resolved)

**Yes — both fields change on every run, even with unchanged dependencies.** Verified in
syft source (`syft/format/common/cyclonedxhelpers/to_format_model.go`, tag **v1.51.1**),
verbatim [[SY-SRC-FMT]][SY-SRC-FMT]:

```go
cdxBOM.SerialNumber = uuid.New().URN()   // line 42 — random v4 UUID every run
...
return &cyclonedx.Metadata{
	Timestamp: time.Now().Format(time.RFC3339),   // line 212 — wall-clock time every run
```

`uuid.New()` (google/uuid) returns a **random** UUID, and `time.Now()` is the current
time — so a byte-for-byte diff of two runs over identical deps will always differ in
`serialNumber` and `metadata.timestamp`. This encoder is shared by both `cyclonedx-json`
and `cyclonedx-xml`. [[SY-SRC-ENC]][SY-SRC-ENC]

**Normalization flags/env in syft: none available today.** A grep of that source shows no
`SOURCE_DATE_EPOCH` handling (the timestamp is unconditionally `time.Now()`), and the
feature request for exactly this — issue **#3931 "Reproducible output for SPDX SBOM"** —
is **OPEN**, asking to "Allow to override `created`, for example using `SOURCE_DATE_EPOCH`"
and to "Add an option to use UUIDv5 … so that the UUID … is reproducible."
[[SY-SRC-FMT]][SY-SRC-FMT][[SY-3931]][SY-3931] (`--source-name` / `--source-version` exist but
set `metadata.component`, not the timestamp/serialNumber.)

**Practical fix — strip the two churning fields before committing/diffing** (the SBOM
stays valid; grype still parses it since both fields are optional in CycloneDX):

```bash
syft . -o cyclonedx-json | jq 'del(.serialNumber, .metadata.timestamp)' > sbom.cdx.json
```

Now the committed `sbom.cdx.json` changes only when the actual component set changes, so a
CI drift check (`syft … | jq … | git diff --exit-code sbom.cdx.json`) is meaningful.

---

## Q7 — Official GitHub Actions

Both are published and maintained by Anchore.

**`anchore/sbom-action` (syft)** — generate the SBOM [[SBOM-ACTION]][SBOM-ACTION]:

```yaml
- uses: anchore/sbom-action@v0
  with:
    path: .                 # directory to scan (default: current dir)
    format: cyclonedx-json  # one of: spdx, spdx-json, cyclonedx, cyclonedx-json (default spdx-json)
    output-file: sbom.cdx.json
```

**`anchore/scan-action` (grype)** — scan + gate [[SCAN-ACTION]][SCAN-ACTION]:

```yaml
- uses: anchore/scan-action@v7
  with:
    sbom: sbom.cdx.json     # scan a pre-generated SBOM (also supports `path:` / `image:`)
    fail-build: true        # default true
    severity-cutoff: high   # negligible|low|medium|high|critical; default medium
    only-fixed: false
    output-format: sarif    # json | sarif | cyclonedx-json | cyclonedx-xml | table
```

`scan-action` runs Grype locally in the runner (no external data submission). Its
`severity-cutoff` + `fail-build` are the Action-level equivalent of `--fail-on`.
[[SCAN-ACTION]][SCAN-ACTION]

---

## Recommended command sequence

### Local / pre-push (one SBOM, both ecosystems, gated)

```bash
# 1. ONE project-wide SBOM from the repo root — syft catalogs backend/Cargo.lock
#    AND frontend/package-lock.json in a single pass. Strip churning fields so the
#    committed SBOM is drift-checkable.
syft . -o cyclonedx-json | jq 'del(.serialNumber, .metadata.timestamp)' > sbom.cdx.json

# 2. Gate on the SBOM (no source re-scan). Exit code 2 == vulns at/above threshold.
GRYPE_DB_AUTO_UPDATE=false grype sbom:sbom.cdx.json --fail-on high   # cached DB, no net I/O

# 3. Rust-specific depth that grype does NOT provide (unmaintained/unsound/notice/yanked).
( cd backend && cargo audit )
```

Handle grype's exit code explicitly if you need to tell findings from tool errors:
`2` = vulns found (fail the build), `1` = grype error, `100` = DB upgrade available, `0` = clean.

### CI (GitHub Actions)

```yaml
- uses: anchore/sbom-action@v0
  with: { path: ., format: cyclonedx-json, output-file: sbom.cdx.json }
- uses: anchore/scan-action@v7
  with: { sbom: sbom.cdx.json, severity-cutoff: high, fail-build: true }
# Rust extras (RustSec-direct) — not redundant with grype:
- run: cargo install cargo-audit && (cd backend && cargo audit)
```

### Where `cargo-audit` fits

**Not redundant.** grype gives you a single full-stack CVE gate (Rust + npm) sourced from
GHSA/NVD, where GHSA already imports RustSec CVEs. `cargo-audit` adds the RustSec-only,
non-CVE signal — `unmaintained`, `unsound`, `notice`, yanked crates — for the backend.
Run grype as the primary gate and `cargo-audit` as a backend-only supplement.

---

## Sources

- [G-REL] grype latest release (v0.118.0, 2026-08-27): https://api.github.com/repos/anchore/grype/releases/latest
- [SY-REL] syft latest release (v1.51.1, 2026-08-27): https://api.github.com/repos/anchore/syft/releases/latest
- [G-SCAN] Grype — Supported Scan Targets (SBOM input + accepted formats): https://oss.anchore.com/docs/guides/vulnerability/scan-targets/
- [G-CLI] Grype — Command Line Reference (`db` subcommands, `--fail-on`/`-o`): https://oss.anchore.com/docs/reference/grype/cli/
- [G-CONFIG] Grype — Configuration Reference (`fail-on-severity`, DB keys/defaults): https://oss.anchore.com/docs/reference/grype/configuration/
- [G-DBGUIDE] Grype — Vulnerability Database guide (auto-update, 5-day staleness, db cmds): https://oss.anchore.com/docs/guides/vulnerability/database/
- [G-DBARCH] Grype — grype-db architecture (providers, Vunnel, air-gap): https://oss.anchore.com/docs/architecture/grype-db/
- [G-INSTALL] Grype — Installing Grype (curl/brew/docker/…): https://oss.anchore.com/docs/installation/grype/
- [G-ALLPKGS] Grype/Syft — all-packages capabilities (rust-cargo-lock-cataloger, javascript-lock-cataloger): https://oss.anchore.com/docs/capabilities/all-packages/
- [G-SRC-SEV] grype source — `grype/vulnerability/severity.go` (severity order): https://github.com/anchore/grype/blob/main/grype/vulnerability/severity.go
- [G-SRC-ROOT] grype source — `cmd/grype/cli/commands/root.go` (`sbom:` scheme, rust+js matchers, fail-on handling, DB auto-update): https://github.com/anchore/grype/blob/main/cmd/grype/cli/commands/root.go
- [G-SRC-CLI] grype source — `cmd/grype/cli/cli.go` @ v0.118.0 (`WithMapExitCode`: exit 2 / 100 / 1): https://github.com/anchore/grype/blob/v0.118.0/cmd/grype/cli/cli.go
- [G-MATCHERDIR] grype source — `grype/matcher/` directory (rust, javascript subpackages): https://github.com/anchore/grype/tree/main/grype/matcher
- [CLIO] anchore/clio — `application.go` (default exit code 1, `MapExitCode` hook): https://github.com/anchore/clio/blob/main/application.go
- [SY-SRC-FMT] syft source — `syft/format/common/cyclonedxhelpers/to_format_model.go` @ v1.51.1 (SerialNumber=uuid.New().URN(), Timestamp=time.Now()): https://github.com/anchore/syft/blob/v1.51.1/syft/format/common/cyclonedxhelpers/to_format_model.go
- [SY-SRC-ENC] syft source — `syft/format/internal/cyclonedxutil/encoder.go` (shared CDX encoder → ToFormatModel): https://github.com/anchore/syft/blob/main/syft/format/internal/cyclonedxutil/encoder.go
- [SY-3931] syft issue #3931 — "Reproducible output for SPDX SBOM" (OPEN; requests SOURCE_DATE_EPOCH + deterministic UUID): https://github.com/anchore/syft/issues/3931
- [GHSA] GitHub Advisory Database — supported ecosystems (Rust/crates.io, Npm) & data sources (incl. "The RustSec Advisory database"): https://docs.github.com/en/code-security/security-advisories/working-with-global-security-advisories-from-the-github-advisory-database/about-the-github-advisory-database
- [RUSTSEC] RustSec Advisory Database README (crates.io advisories; OSV + GHSA export; unsound/unmaintained/notice types): https://github.com/rustsec/advisory-db
- [CARGO-AUDIT] cargo-audit README (uses RustSec advisory-db; `cargo install cargo-audit`; `cargo audit`): https://github.com/rustsec/rustsec/tree/main/cargo-audit
- [VUNNEL] anchore/vunnel — GitHub (GHSA) provider (`src/vunnel/providers/github/__init__.py`, iterates advisory.ecosystems): https://github.com/anchore/vunnel/blob/main/src/vunnel/providers/github/__init__.py
- [SBOM-ACTION] anchore/sbom-action (official syft GitHub Action): https://github.com/anchore/sbom-action
- [SCAN-ACTION] anchore/scan-action (official grype GitHub Action, `@v7`): https://github.com/anchore/scan-action
- [REF-SNYK] Sibling research file (syft/cargo-sbom/cargo-cyclonedx/Snyk; cross-reference, not edited): `backend/docs/research/2026-09-15-rust-sbom-snyk.md`

[G-REL]: https://api.github.com/repos/anchore/grype/releases/latest
[SY-REL]: https://api.github.com/repos/anchore/syft/releases/latest
[G-SCAN]: https://oss.anchore.com/docs/guides/vulnerability/scan-targets/
[G-CLI]: https://oss.anchore.com/docs/reference/grype/cli/
[G-CONFIG]: https://oss.anchore.com/docs/reference/grype/configuration/
[G-DBGUIDE]: https://oss.anchore.com/docs/guides/vulnerability/database/
[G-DBARCH]: https://oss.anchore.com/docs/architecture/grype-db/
[G-INSTALL]: https://oss.anchore.com/docs/installation/grype/
[G-ALLPKGS]: https://oss.anchore.com/docs/capabilities/all-packages/
[G-SRC-SEV]: https://github.com/anchore/grype/blob/main/grype/vulnerability/severity.go
[G-SRC-ROOT]: https://github.com/anchore/grype/blob/main/cmd/grype/cli/commands/root.go
[G-SRC-CLI]: https://github.com/anchore/grype/blob/v0.118.0/cmd/grype/cli/cli.go
[G-MATCHERDIR]: https://github.com/anchore/grype/tree/main/grype/matcher
[CLIO]: https://github.com/anchore/clio/blob/main/application.go
[SY-SRC-FMT]: https://github.com/anchore/syft/blob/v1.51.1/syft/format/common/cyclonedxhelpers/to_format_model.go
[SY-SRC-ENC]: https://github.com/anchore/syft/blob/main/syft/format/internal/cyclonedxutil/encoder.go
[SY-3931]: https://github.com/anchore/syft/issues/3931
[GHSA]: https://docs.github.com/en/code-security/security-advisories/working-with-global-security-advisories-from-the-github-advisory-database/about-the-github-advisory-database
[RUSTSEC]: https://github.com/rustsec/advisory-db
[CARGO-AUDIT]: https://github.com/rustsec/rustsec/tree/main/cargo-audit
[VUNNEL]: https://github.com/anchore/vunnel/blob/main/src/vunnel/providers/github/__init__.py
[SBOM-ACTION]: https://github.com/anchore/sbom-action
[SCAN-ACTION]: https://github.com/anchore/scan-action
[REF-SNYK]: ./2026-09-15-rust-sbom-snyk.md
