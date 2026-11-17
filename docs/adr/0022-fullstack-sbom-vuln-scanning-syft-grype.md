# Full-stack SBOM + vulnerability scanning with syft + grype; Snyk abandoned

Origin: #18

The project needs an SBOM (a Software Bill of Materials: the list of each
dependency) and a vulnerability scan of both subtrees. `snyk sbom test` and
`snyk sbom monitor` need the Snyk Enterprise plan, and this project is on the
free plan. The research notes in `docs/research/` hold the cited evidence.

## Decisions

- **One SBOM for the whole repo, made by syft.** One CycloneDX 1.6 JSON file,
  `/sbom.cdx.json`, covers the Rust and the TypeScript dependencies.
- **The npm input is a derived `yarn.lock`.** syft reads `bun.lock` in part, and
  the result changes from run to run. So `scripts/sbom.sh` converts `bun.lock`
  to a temporary `yarn.lock`, which syft reads in full and the same way each
  time. The `yarn.lock` is never committed.
- **The SBOM is normalized, committed and checked by a drift guard.** The script
  removes the random `serialNumber` and the `metadata.timestamp`, removes local
  paths, and sorts the components and dependencies. So the file changes only
  when a dependency changes. `cgs sbom:check` makes the SBOM again and fails on
  a difference.
- **grype is the gate; syft never gates.** grype scans the SBOM with
  `--fail-on high`, so a High or a Critical finding fails. `scripts/grype-scan.sh`
  maps each exit code: `2` is a finding (fail), `0` is clean, `100` is "a DB
  update is available" (pass with a notice), and any other code is a tool error
  (fail).
- **VEX records a finding that does not apply.** VEX (Vulnerability Exploitability
  eXchange) is a file of statements about findings. `/vex.openvex.json` is an
  OpenVEX document that grype reads through `--vex`. A `not_affected` statement
  names the affected package's purl as the product. A validity guard,
  `scripts/vex-check.sh`, scans without the VEX and fails if a statement matches
  no real finding.
- **The Rust tools each have one role.**
  - `cargo-audit` gates with `--deny warnings`. It reads RustSec directly, so it
    catches `unmaintained`, `unsound` and yanked crates that grype misses.
  - `cargo-deny` gates on licenses, bans and sources.
  - `cargo-auditable` embeds the dependency list in each release binary, so
    `cargo audit bin` can audit a shipped binary.
  - `cargo-udeps` and `cargo-geiger` report only. udeps needs nightly and can
    give false positives. geiger counts `unsafe` in dependencies, which the
    project does not control; the workspace forbids `unsafe` in its own code.
- **The scan runs in four places.**
  1. `cgs scan`, by hand.
  2. A pre-push hook. It scans the committed SBOM of each pushed ref with the
     cached DB, offline. A missing DB, or a DB older than five days, blocks the
     push.
  3. CI, on each PR and each push to `main`.
  4. A daily CI schedule, which finds a new advisory on an unchanged
     dependency.

  The weekly dependency update (`deps.yml`) also runs `cargo audit`,
  `cargo deny`, the grype gate and the VEX guard. A failure stops the job, so no
  update PR opens.
- **Fix a finding by a re-resolve first.** A fresh `bun.lock` from the declared
  ranges fixes most transitive findings. Use a `package.json` override only
  for a transitive that a parent pins to an exact vulnerable version. bun
  overrides are global by name, so a broad override can force a version below a
  consumer's range.
- **Each tool is pinned with a checksum.** `scripts/sbom.sh` downloads its
  pinned syft and checks the sha256 before it runs it. It ignores any `syft` on
  `PATH`, because a new syft changes the catalog output. `scripts/grype-install.sh`
  pins grype for CI in the same way.

## Considered and rejected

- **Snyk through the SBOM CLI.** It needs the Enterprise plan.
- **`cargo-sbom` or `cargo-cyclonedx`.** Each is Rust-only, so it cannot make
  one SBOM for both stacks.
- **grype alone, with no `cargo-audit`.** grype misses the RustSec signals
  that are not CVEs.
- **A pre-commit grype hook.** A full scan is too slow for each commit.
- **No scheduled scan.** A hook runs only on a change, so it never sees a new
  advisory on an old dependency.
- **A broad override set.** Overrides bypass each parent's range.

## Consequences

- If a check assumes that grype exits `1` on a finding, it is wrong. Without
  `--fail-on`, grype exits `0` even when it prints findings.
- The pre-push hook is a local convenience. The CI job is the real gate, and
  `git push --no-verify` skips only the hook.
- The weekly gate sees only advisories published before it runs. Before you
  merge the weekly PR, run `cgs audit` and `cgs scan`.
- No third-party account or secret is needed.
