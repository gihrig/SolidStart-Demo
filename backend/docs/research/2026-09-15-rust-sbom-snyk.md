# Rust backend SBOM generation + Snyk scanning

**File:** `backend/docs/research/2026-09-15-rust-sbom-snyk.md`
**Date:** 2026-09-15
**Issue:** #18 — generate an SBOM for the Rust backend, then run Snyk against that SBOM.
**Scope:** Rust/Cargo backend only. The frontend TypeScript project stays on Snyk's
normal dashboard/SCM integration and is out of scope here.

> Method note: every factual claim below is cited inline to a primary source (official
> docs or the tool's own source/repo). Where two sources disagreed, the tool's own
> source code was treated as authoritative. Anything not confirmed from a primary
> source is flagged explicitly.

---

## Summary & recommendation

- **`snyk sbom test` accepts** CycloneDX **JSON 1.4, 1.5, 1.6** and SPDX **JSON 2.3**,
  and every package must carry a PackageURL (`purl`); `cargo` is a supported purl type.
  It is an **Enterprise-plan** feature. [[S1]][S1][[S2]][S2]
- **`snyk sbom test` is one-shot.** Continuous monitoring is a *separate* command,
  **`snyk sbom monitor --experimental`** (also Enterprise-only), or the Snyk SBOM APIs.
  Issue #18's "test … monitor" is therefore **two commands**, not one. [[S2]][S2][[S3]][S3]
- **Recommended tool:** **`cargo-sbom`** (psastras/sbom-rs) emitting **CycloneDX 1.5 JSON**
  (or its default SPDX 2.3 JSON). It is purpose-built for Cargo workspaces, writes one
  document to stdout, emits `pkg:cargo` purls Snyk can match, and every format it
  produces is Snyk-accepted. **Caveat:** its last release is 0.10.0 (2025-06-17), so if
  active maintenance is weighted more heavily, **`cargo-cyclonedx`** (official CycloneDX
  project, 0.5.9 2026-03-19) with `--spec-version 1.5 --format json` is the safer
  long-term pick — but note it defaults to CycloneDX **1.3 (not Snyk-accepted)** and
  cannot emit 1.6. [[T-CS-CRATES]][T-CS-CRATES][[T-CDX-CRATES]][T-CDX-CRATES]
- **CI command sequence** (see the closing recommendation for the full snippet):
  `cargo install cargo-sbom` → `cargo sbom --output-format cyclone_dx_json_1_5 > sbom.cdx.json`
  → `snyk sbom test --file=sbom.cdx.json` (gate on exit code 1).

---

## Q1 — Rust SBOM tool + format comparison

| | `cargo-cyclonedx` | `cargo-sbom` | `syft` |
|---|---|---|---|
| Project | CycloneDX/cyclonedx-rust-cargo (official CycloneDX) | psastras/sbom-rs (single maintainer) | anchore/syft (Anchore) |
| Latest / date | **0.5.9** — 2026-03-19 [[T-CDX-CRATES]][T-CDX-CRATES] | **0.10.0** — 2025-06-17 [[T-CS-CRATES]][T-CS-CRATES] | **v1.51.1** — 2026-08-27 [[T-SY-REL]][T-SY-REL] |
| Install | `cargo install cargo-cyclonedx` [[T-CDX-README]][T-CDX-README] | `cargo install cargo-sbom` [[T-CS-README]][T-CS-README] | `curl -sSfL https://get.anchore.io/syft \| sudo sh -s -- -b /usr/local/bin` [[T-SY-README]][T-SY-README] |
| Generate | `cargo cyclonedx` [[T-CDX-README]][T-CDX-README] | `cargo sbom` [[T-CS-README]][T-CS-README] | `syft ./my-project -o cyclonedx-json` [[T-SY-README]][T-SY-README] |
| CycloneDX versions | 1.3, 1.4, 1.5 (default **1.3**); **no 1.6** [[T-CDX-CLI]][T-CDX-CLI] | 1.4, 1.5, 1.6 (JSON) [[T-CS-MAIN]][T-CS-MAIN] | default **1.6** (json/xml) [[T-SY-FMT]][T-SY-FMT] |
| SPDX versions | none (CycloneDX-only) | **2.3 JSON (default)** [[T-CS-MAIN]][T-CS-MAIN] | **2.3 JSON** + tag-value [[T-SY-FMT]][T-SY-FMT] |
| JSON / XML | `--format json\|xml` [[T-CDX-CLI]][T-CDX-CLI] | JSON only [[T-CS-MAIN]][T-CS-MAIN] | JSON + XML (CycloneDX) [[T-SY-FMT]][T-SY-FMT] |
| Input source | `Cargo.lock` + `cargo metadata` [[T-CDX-README]][T-CDX-README] | `cargo metadata` (Cargo.toml/lock) [[T-CS-MAIN]][T-CS-MAIN] | reads `**/Cargo.lock`; also cargo-auditable binaries [[T-SY-CAT]][T-SY-CAT] |
| Emits `pkg:cargo` purl | yes [[T-CDX-PURL]][T-CDX-PURL] | yes (SPDX + CycloneDX) [[T-CS-PURL]][T-CS-PURL] | yes [[T-SY-PURL]][T-SY-PURL] |
| Workspace | one BOM per `Cargo.toml` in the workspace [[T-CDX-README]][T-CDX-README] | one document to stdout, workspace-aware [[T-CS-MAIN]][T-CS-MAIN] | filesystem scan, multi-ecosystem [[T-SY-README]][T-SY-README] |
| Maintenance | active (release 2026-03) | quieter (last release 2025-06) | very active (release 2026-08) |

### `cargo-cyclonedx` (CycloneDX/cyclonedx-rust-cargo)

- Install / run, verbatim from the README: `cargo install cargo-cyclonedx`, then
  `cargo cyclonedx`, which "sources data both from `Cargo.lock` and from `cargo metadata`"
  and writes "a `bom.xml` file adjacent to every `Cargo.toml` file that exists in the
  workspace." [[T-CDX-README]][T-CDX-README]
- Output format flag, verbatim from `src/cli.rs`:
  ```rust
  /// Output BOM format: json, xml
  #[clap(long = "format", short = 'f', value_name = "FORMAT")]
  pub format: Option<Format>,
  ```
  [[T-CDX-CLI]][T-CDX-CLI]
- Spec version, verbatim from `src/cli.rs` — **this is the key limitation for Snyk**:
  ```rust
  /// The CycloneDX specification version to output: `1.3`, `1.4` or `1.5`. Defaults to 1.3
  #[clap(long = "spec-version")]
  pub spec_version: Option<SpecVersion>,
  ```
  [[T-CDX-CLI]][T-CDX-CLI] The CHANGELOG confirms 1.5 was added in 0.5.1 and 1.4 in
  0.5.0, with **no entry adding 1.6**. [[T-CDX-CHANGELOG]][T-CDX-CHANGELOG]
- Because the default is **1.3** (which `snyk sbom test` does **not** accept) and 1.6 is
  unavailable, feeding Snyk requires `cargo cyclonedx --format json --spec-version 1.5`.
- Emits purls: `src/generator.rs` sets `component.purl = purl;` from a dedicated
  `src/purl.rs` module. [[T-CDX-PURL]][T-CDX-PURL]
- Reads `Cargo.lock` / `cargo metadata` — it does **not** need a built binary. Note the
  README warns it should not be run on untrusted projects because Cargo may run arbitrary
  code. [[T-CDX-README]][T-CDX-README]

### `cargo-sbom` (psastras/sbom-rs)

- Install / run: `cargo install cargo-sbom`, then `cargo sbom` (writes to stdout;
  e.g. `cargo-sbom > sbom.spdx.json`). [[T-CS-README]][T-CS-README][[T-CS-MAIN]][T-CS-MAIN]
- Output formats, verbatim from `src/main.rs`:
  ```rust
  enum OutputFormat {
    SpdxJson_2_3,
    CycloneDxJson_1_4,
    CycloneDxJson_1_5,
    CycloneDxJson_1_6,
  }
  ```
  with the help line: `[default: spdx_json_2_3] [possible values: spdx_json_2_3,
  cyclone_dx_json_1_4, cyclone_dx_json_1_5, cyclone_dx_json_1_6]`. Selected via
  `--output-format=<value>`. [[T-CS-MAIN]][T-CS-MAIN] So it produces **SPDX 2.3** and
  **CycloneDX 1.4 / 1.5 / 1.6** — every one of them Snyk-accepted.
- Input source: dependency data is "parsed from cargo-metadata" (it reads the Cargo
  project metadata, not a compiled binary). [[T-CS-MAIN]][T-CS-MAIN]
- Emits purls in **both** formats — SPDX external refs and CycloneDX component purls,
  verbatim from source:
  ```rust
  // src/util/spdx/mod.rs
  .reference_category("PACKAGE-MANAGER")
  .reference_type("purl")
  .reference_locator(purl)
  ```
  ```rust
  // src/util/cyclonedx/mod.rs
  let purl = packageurl::PackageUrl::new::<&str, &str>(
    "cargo",
  ...
  cyclonedx_component_builder.purl(purl);
  ```
  [[T-CS-PURL]][T-CS-PURL]
- Self-describes as a "command line tool to create software bill of materials (SBOM) for
  Cargo / Rust workspaces. It supports both SPDX and CycloneDX outputs." [[T-CS-MAIN]][T-CS-MAIN]
- **Maintenance flag:** latest published version is 0.10.0, dated **2025-06-17**
  (crates.io API). [[T-CS-CRATES]][T-CS-CRATES]

### `syft` (anchore/syft)

- Install (verbatim): `curl -sSfL https://get.anchore.io/syft | sudo sh -s -- -b /usr/local/bin`;
  Homebrew, Docker, Scoop, Chocolatey, Nix "and more" are also listed. [[T-SY-README]][T-SY-README]
- Generate: `syft ./my-project`, `syft <target> -o cyclonedx-json`, or write multiple
  files at once, e.g. `syft <target> -o spdx-json=./spdx.json -o cyclonedx-json=./cdx.json`.
  [[T-SY-README]][T-SY-README]
- Formats (via `-o`): `cyclonedx-json`, `cyclonedx-xml`, `spdx-json`, `spdx-tag-value`,
  `syft-json`, `github-json`, `template`, etc. Per Anchore's format docs, `cyclonedx-json`
  conforms to **CycloneDX 1.6** and `spdx-json` to **SPDX 2.3**; a specific spec version
  can be pinned with `@<version>` (documented example: `spdx-json@2.2`). [[T-SY-FMT]][T-SY-FMT]
  *(Not confirmed from a primary source: whether CycloneDX output can likewise be pinned
  to an older `@1.5`/`@1.4`; the default 1.6 is already Snyk-accepted, so pinning is not
  required.)*
- Rust support: the `rust-cargo-lock-cataloger` parses `**/Cargo.lock`, and a separate
  `cargo-auditable-binary-cataloger` reads compiled binaries — verbatim from source:
  ```go
  return generic.NewCataloger("rust-cargo-lock-cataloger").
      WithParserByGlobs(parseCargoLock, "**/Cargo.lock")
  ```
  [[T-SY-CAT]][T-SY-CAT] Packages get a `pkg:cargo` purl (`packageurl.TypeCargo` in
  `package.go`). [[T-SY-PURL]][T-SY-PURL]
- Maintenance: very active — latest release **v1.51.1**, 2026-08-27. [[T-SY-REL]][T-SY-REL]

### Best fit for a Cargo workspace

**`cargo-sbom`** is the closest fit to the literal goal: it is built for Cargo
workspaces, runs as one `cargo` subcommand, emits a single document to stdout, and its
**default** output (SPDX 2.3 JSON) is already a Snyk-accepted format — with CycloneDX
1.4/1.5/1.6 also available, all carrying `pkg:cargo` purls. That is the least-friction
path into `snyk sbom test`. The one real trade-off is maintenance cadence (last release
2025-06). `cargo-cyclonedx` is the more actively maintained, official CycloneDX tool but
adds friction for this use case: its default (1.3) is rejected by Snyk, it can't emit
1.6, and in a workspace it writes a `bom.xml` per crate rather than one document to
stdout. `syft` is excellent and very active but is a general-purpose multi-ecosystem
scanner needing its own (non-cargo) install — more than this single Cargo workspace
needs, though it would be the natural choice if you ever want one scanner across both the
Rust and TypeScript sides.

---

## Q2 — What `snyk sbom test` accepts

Verbatim from the official command reference and the CLI's own help source:

- Accepted formats: **"CycloneDX: JSON version 1.4, 1.5, and 1.6"** and
  **"SPDX: JSON version 2.3"**. [[S1]][S1][[S2]][S2]
- Purl requirement (quoted): **"Packages and components within the provided SBOM file
  must be identified by a PackageURL (purl)."** Supported purl types (quoted):
  **"`apk`, `cargo`, `cocoapods`, `conan`, `composer`, `deb`, `gem`, `generic`,
  `golang`, `hex`, `maven`, `npm`, `nuget`, `pub`, `pypi`, `rpm`, `swift`."** — `cargo`
  is included, so a Rust SBOM matches. [[S1]][S1]
- File flag: **`--file=<FILE_PATH>`** — "Required. Specify the file path of the SBOM
  document." [[S1]][S1]
- No `--experimental` flag is documented for `snyk sbom test` (unlike `snyk sbom monitor`,
  which requires it — see Q3). [[S1]][S1][[S2]][S2]
- **Plan gating (paid):** **"This feature is available to customers on Snyk Enterprise
  plans."** So `snyk sbom test` is an Enterprise-tier feature. [[S1]][S1][[S2]][S2]

---

## Q3 — CLI / API workflow + auth

### Install the Snyk CLI (any one), verbatim [[S4]][S4]

```bash
npm install snyk -g                       # npm
brew tap snyk/tap && brew install snyk    # Homebrew
docker pull snyk/snyk                     # Docker
# standalone binary (Linux):
curl --compressed https://downloads.snyk.io/cli/stable/snyk-linux -o snyk && chmod +x snyk
```

### Authenticate non-interactively [[S5]][S5]

```bash
snyk auth <YOUR_API_TOKEN>          # interactive/one-time
export SNYK_TOKEN=<YOUR_PAT_OR_API_TOKEN>   # CI/CD — CLI reads it automatically
SNYK_TOKEN=<TOKEN> snyk <COMMAND>   # or per-command
```

The docs state: for CI/CD (Jenkins, GitLab, CircleCI, GitHub Actions, …) "Map your
securely stored PAT or API token to the `SNYK_TOKEN` environment variable, or map your
OAuth token to `SNYK_OAUTH_TOKEN`." [[S5]][S5]

### Test an SBOM (one-shot)

```bash
snyk sbom test --file=sbom.cdx.json
```

`--file` is required. [[S1]][S1]

### Test vs. monitor — resolving issue #18's "test … monitor"

These are **two different commands**:

- **`snyk sbom test`** performs a one-time scan of the SBOM and returns results/exit
  code. It does **not** register anything on the Snyk platform for ongoing tracking.
  [[S1]][S1]
- **`snyk sbom monitor --experimental --file=<sbom>`** "creates a target and projects in
  your Snyk account to be continuously monitored for open-source vulnerabilities and
  license issues," on a configurable frequency (default daily). It **requires the
  `--experimental` flag** and accepts the **same** formats (CycloneDX JSON 1.4/1.5/1.6,
  SPDX JSON 2.3). Like `sbom test`, it is **Enterprise-only** ("This feature is available
  only with Enterprise plans."). [[S3]][S3]
- The Snyk **SBOM APIs** are the programmatic equivalent for import/test over time.
  [[S6]][S6]

So: use `snyk sbom test` to **gate CI on the current build**, and `snyk sbom monitor`
(or the SBOM API) to **track the same SBOM over time** on the Snyk platform. One command
does not do both.

### Exit codes (for CI gating), verbatim [[S1]][S1]

- **`0`** — success (scan completed), no vulnerabilities found
- **`1`** — action_needed (scan completed), vulnerabilities found
- **`2`** — failure, try to re-run the command

A CI step fails naturally on exit `1`; treat `2` as an infrastructure/retry error.

### GitHub Actions integration

Snyk publishes official Actions, but there is **no dedicated SBOM action**. The SBOM path
uses the generic setup action: **"you can instead use the `snyk/actions/setup` Action to
just install Snyk CLI"**, after which you run any command (including `snyk sbom test`).
The token is passed as `env: SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}`. [[S7]][S7] (The
language-specific `snyk/actions/*` wrappers target `snyk test`/`snyk monitor`, not the
SBOM commands, so `snyk/actions/setup` + an explicit run step is the correct pattern
here.)

---

## Recommendation

Standardize on **`cargo-sbom` emitting CycloneDX 1.5 JSON** (its SPDX 2.3 default is an
equally valid Snyk-accepted fallback). It is the lowest-friction fit for a Cargo
workspace — one `cargo` subcommand, one document on stdout, `pkg:cargo` purls that Snyk
matches, and every output format it produces is on Snyk's accepted list. In the existing
`backend` CI job, add a security step after the build:

```yaml
# requires SNYK_TOKEN in repo secrets; snyk sbom test is an Enterprise feature
- run: cargo install cargo-sbom
- run: cargo sbom --output-format cyclone_dx_json_1_5 > sbom.cdx.json
- uses: snyk/actions/setup@master
- run: snyk sbom test --file=sbom.cdx.json      # exit 1 = vulns found → fails CI
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
# optional: track the same SBOM over time on the Snyk platform
- run: snyk sbom monitor --experimental --file=sbom.cdx.json
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

If active upstream maintenance outweighs the workflow simplicity, substitute
**`cargo-cyclonedx`** for the generate step —
`cargo install cargo-cyclonedx && cargo cyclonedx --format json --spec-version 1.5` — and
point `--file` at the generated `bom.json`; the rest is identical. Do **not** rely on
either tool's default spec version for Snyk: `cargo-cyclonedx` defaults to CycloneDX 1.3
(rejected), so `--spec-version 1.5` is mandatory. Both `snyk sbom test` and
`snyk sbom monitor` require a Snyk **Enterprise** plan — confirm entitlement before
wiring this into CI.

---

## Sources

- [S1] Snyk — SBOM test (command reference): https://docs.snyk.io/developer-tools/snyk-cli/commands/sbom-test
- [S2] Snyk CLI repo — `help/cli-commands/sbom-test.md`: https://github.com/snyk/cli/blob/main/help/cli-commands/sbom-test.md
- [S3] Snyk CLI repo — `help/cli-commands/sbom-monitor.md`: https://github.com/snyk/cli/blob/main/help/cli-commands/sbom-monitor.md
- [S4] Snyk — Install or update the Snyk CLI: https://docs.snyk.io/developer-tools/snyk-cli/install-the-snyk-cli
- [S5] Snyk — Authenticate to use the CLI: https://docs.snyk.io/developer-tools/snyk-cli/authenticate-to-use-the-cli
- [S6] Snyk — SBOM APIs (test an SBOM document for vulnerabilities): https://docs.snyk.io/snyk-api/using-specific-snyk-apis/sbom-apis/rest-api-endpoint-test-an-sbom-document-for-vulnerabilities
- [S7] Snyk — official GitHub Actions (`snyk/actions`, incl. `snyk/actions/setup`): https://github.com/snyk/actions
- [T-CDX-README] cargo-cyclonedx README: https://github.com/CycloneDX/cyclonedx-rust-cargo/blob/main/cargo-cyclonedx/README.md
- [T-CDX-CLI] cargo-cyclonedx `src/cli.rs` (`--format`, `--spec-version`): https://github.com/CycloneDX/cyclonedx-rust-cargo/blob/main/cargo-cyclonedx/src/cli.rs
- [T-CDX-CHANGELOG] cargo-cyclonedx CHANGELOG: https://github.com/CycloneDX/cyclonedx-rust-cargo/blob/main/cargo-cyclonedx/CHANGELOG.md
- [T-CDX-PURL] cargo-cyclonedx `src/generator.rs` / `src/purl.rs`: https://github.com/CycloneDX/cyclonedx-rust-cargo/blob/main/cargo-cyclonedx/src/generator.rs
- [T-CDX-CRATES] crates.io — cargo-cyclonedx (0.5.9, 2026-03-19): https://crates.io/crates/cargo-cyclonedx (API: https://crates.io/api/v1/crates/cargo-cyclonedx)
- [T-CS-README] cargo-sbom README: https://github.com/psastras/sbom-rs/blob/main/cargo-sbom/README.md
- [T-CS-MAIN] cargo-sbom `src/main.rs` (OutputFormat enum, defaults, cargo-metadata): https://github.com/psastras/sbom-rs/blob/main/cargo-sbom/src/main.rs
- [T-CS-PURL] cargo-sbom `src/util/spdx/mod.rs` + `src/util/cyclonedx/mod.rs` (purl emission): https://github.com/psastras/sbom-rs/blob/main/cargo-sbom/src/util/cyclonedx/mod.rs
- [T-CS-CRATES] crates.io — cargo-sbom (0.10.0, 2025-06-17): https://crates.io/crates/cargo-sbom (API: https://crates.io/api/v1/crates/cargo-sbom)
- [T-SY-README] syft README: https://github.com/anchore/syft/blob/main/README.md
- [T-SY-FMT] syft output formats (Anchore wiki): https://github.com/anchore/syft/wiki/Output-Formats
- [T-SY-CAT] syft Rust cataloger `syft/pkg/cataloger/rust/cataloger.go`: https://github.com/anchore/syft/blob/main/syft/pkg/cataloger/rust/cataloger.go
- [T-SY-PURL] syft Rust `package.go` (`packageurl.TypeCargo`): https://github.com/anchore/syft/blob/main/syft/pkg/cataloger/rust/package.go
- [T-SY-REL] syft latest release (v1.51.1, 2026-08-27): https://github.com/anchore/syft/releases/latest (API: https://api.github.com/repos/anchore/syft/releases/latest)

[S1]: https://docs.snyk.io/developer-tools/snyk-cli/commands/sbom-test
[S2]: https://github.com/snyk/cli/blob/main/help/cli-commands/sbom-test.md
[S3]: https://github.com/snyk/cli/blob/main/help/cli-commands/sbom-monitor.md
[S4]: https://docs.snyk.io/developer-tools/snyk-cli/install-the-snyk-cli
[S5]: https://docs.snyk.io/developer-tools/snyk-cli/authenticate-to-use-the-cli
[S6]: https://docs.snyk.io/snyk-api/using-specific-snyk-apis/sbom-apis/rest-api-endpoint-test-an-sbom-document-for-vulnerabilities
[S7]: https://github.com/snyk/actions
[T-CDX-README]: https://github.com/CycloneDX/cyclonedx-rust-cargo/blob/main/cargo-cyclonedx/README.md
[T-CDX-CLI]: https://github.com/CycloneDX/cyclonedx-rust-cargo/blob/main/cargo-cyclonedx/src/cli.rs
[T-CDX-CHANGELOG]: https://github.com/CycloneDX/cyclonedx-rust-cargo/blob/main/cargo-cyclonedx/CHANGELOG.md
[T-CDX-PURL]: https://github.com/CycloneDX/cyclonedx-rust-cargo/blob/main/cargo-cyclonedx/src/generator.rs
[T-CDX-CRATES]: https://crates.io/crates/cargo-cyclonedx
[T-CS-README]: https://github.com/psastras/sbom-rs/blob/main/cargo-sbom/README.md
[T-CS-MAIN]: https://github.com/psastras/sbom-rs/blob/main/cargo-sbom/src/main.rs
[T-CS-PURL]: https://github.com/psastras/sbom-rs/blob/main/cargo-sbom/src/util/cyclonedx/mod.rs
[T-CS-CRATES]: https://crates.io/crates/cargo-sbom
[T-SY-README]: https://github.com/anchore/syft/blob/main/README.md
[T-SY-FMT]: https://github.com/anchore/syft/wiki/Output-Formats
[T-SY-CAT]: https://github.com/anchore/syft/blob/main/syft/pkg/cataloger/rust/cataloger.go
[T-SY-PURL]: https://github.com/anchore/syft/blob/main/syft/pkg/cataloger/rust/package.go
[T-SY-REL]: https://github.com/anchore/syft/releases/latest
