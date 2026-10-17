#!/usr/bin/env bash
#
# Single source for the project-wide SBOM (ADR-0022, #138).
# Generates one CycloneDX 1.6 JSON SBOM covering the Rust back-end (Cargo.lock)
# and the TypeScript front-end (bun.lock), normalized so it changes only when a
# dependency changes. This mirrors scripts/adr-index.sh: one script, a `write`
# mode and a `check` (CI drift-guard) mode.
#
#   scripts/sbom.sh write   # regenerate /sbom.cdx.json          (cgs sbom)
#   scripts/sbom.sh check   # fail if /sbom.cdx.json is stale     (cgs sbom:check)
#
# The grype vulnerability gate (T2, #142/#144) scans the SBOM this writes.
#
# Front-end lockfile — why yarn.lock, not bun.lock (ADR-0022 addendum):
# The front-end lockfile is `bun.lock`. syft 1.51.1's bun-lock cataloger is
# partial AND non-deterministic: repeated runs return a different, small subset
# of the ~969 packages (e.g. 30/33/35). It cannot back a drift guard. We convert
# `bun.lock` to a `yarn.lock` (`bun install --frozen-lockfile --yarn`), which
# syft reads completely and deterministically (969/969/969). The yarn.lock is a
# throwaway build artifact — generated into a temp staging tree, never committed.
#
# Normalization — why more than the two ADR fields:
# syft writes a random `serialNumber` and a wall-clock `metadata.timestamp` on
# every run (ADR-0022; syft has no reproducible-output flag, upstream #3931). We
# strip both. More steps make the output byte-identical AND portable across
# machines, so the CI drift guard does not flap:
#   1. Scan a temp staging tree holding ONLY backend/Cargo.lock and the derived
#      frontend/yarn.lock. syft records staging-relative paths (/backend/...,
#      /frontend/...), so no absolute machine path leaks into the SBOM.
#   2. --override-default-catalogers: run ONLY the two lockfile catalogers.
#   3. jq: drop the two churning fields, drop the source "file" components (they
#      carry a path in their name and no `pkg:` purl; the dependency graph never
#      references them), and sort `components` and `dependencies` so syft's
#      run-to-run ordering churn cannot leak in.
#
# syft pin — why this script fetches its own syft:
# A syft upgrade changes catalog output, so the drift guard needs the SAME syft
# version locally and in CI. A PATH syft (e.g. Homebrew) drifts on every package
# update. This script is the single pin: it downloads the release below into
# /.tools/, verifies the tarball's sha256 BEFORE running it, and ignores any PATH
# syft. CI runs this script too, so it installs nothing itself. To bump: set
# SYFT_VERSION, copy the four sha256 values from the release's
# syft_<version>_checksums.txt, then run `cgs sbom` and commit /sbom.cdx.json.
set -euo pipefail

# Resolve repo root from this script's location so it runs from any cwd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SBOM="$ROOT/sbom.cdx.json"

SYFT_VERSION="1.54.1"

# Printed on any syft install failure: how to move the pin to another release.
syft_help() {
  cat >&2 <<EOF

sbom.sh: could not install the pinned syft $SYFT_VERSION.
To update the syft pin, edit scripts/sbom.sh:
  1. Set SYFT_VERSION to the new release (e.g. 1.55.0, no leading "v").
  2. Replace the four sha256 values in syft_sha256() with the matching lines of
     https://github.com/anchore/syft/releases/download/v<version>/syft_<version>_checksums.txt
     (darwin_amd64, darwin_arm64, linux_amd64, linux_arm64 .tar.gz).
  3. Run 'cgs sbom' and commit scripts/sbom.sh + /sbom.cdx.json together.
EOF
}

# sha256 of syft_<SYFT_VERSION>_<platform>.tar.gz. Bump with SYFT_VERSION.
syft_sha256() {
  case "$1" in
    darwin_amd64) echo 2956322838b2f64e470eea474495f0cd96be4f222b1ac037258cdc47d965064e ;;
    darwin_arm64) echo b4319c3abaa87a0170ab76ee83ea2260ca34b53aecfa3ab0dd5428d2319d744f ;;
    linux_amd64)  echo c069905b391cc4c20a5ba65ad5c10be2a7ba074f8ea6ad203e24d14e303dad47 ;;
    linux_arm64)  echo dfdf0537610113edbefe1f1fc6548bc957b2d77439636ec824fcf0e10d46d054 ;;
    *) echo "sbom.sh: no pinned syft checksum for platform '$1'." >&2; return 1 ;;
  esac
}

# Set SYFT to the pinned syft's path, downloading + verifying it on first use.
# Call it directly, not inside $(...): bash clears `set -e` in command
# substitutions, so a failed checksum there would not stop the script.
ensure_syft() {
  local bin="$ROOT/.tools/syft-$SYFT_VERSION/syft"
  if [[ ! -x "$bin" ]]; then
    local os arch platform sha tarball tmp
    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    case "$(uname -m)" in
      x86_64 | amd64) arch=amd64 ;;
      arm64 | aarch64) arch=arm64 ;;
      *) arch="$(uname -m)" ;;
    esac
    platform="${os}_${arch}"
    sha="$(syft_sha256 "$platform")" || { syft_help; return 1; }
    tarball="syft_${SYFT_VERSION}_${platform}.tar.gz"
    local sha_cmd=(shasum -a 256)
    command -v sha256sum >/dev/null && sha_cmd=(sha256sum)
    tmp="$(mktemp -d)"
    echo "Installing pinned syft $SYFT_VERSION ($platform) into .tools/ ..." >&2
    # One subshell, one exit path: its EXIT trap cleans up on success or any
    # failed step, and the `||` below prints the pin help once. The binary is
    # staged beside $bin, then renamed into place (atomic on one filesystem),
    # so a concurrent run never executes a half-written file.
    (
      trap 'rm -rf "$tmp" "$bin.$$"' EXIT
      curl -sSfL "https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}/${tarball}" -o "$tmp/$tarball" &&
        echo "$sha  $tmp/$tarball" | "${sha_cmd[@]}" -c - >&2 &&
        tar -xzf "$tmp/$tarball" -C "$tmp" syft &&
        mkdir -p "$(dirname "$bin")" &&
        install -m 0755 "$tmp/syft" "$bin.$$" &&
        mv -f "$bin.$$" "$bin"
    ) || { syft_help; return 1; }
  fi
  # Guard against a swapped or corrupt cached binary.
  local got
  got="$("$bin" version -o json | jq -r .version)" || got="(version check failed)"
  if [[ "$got" != "$SYFT_VERSION" ]]; then
    echo "sbom.sh: $bin reports syft $got, expected $SYFT_VERSION. Delete .tools/ and retry." >&2
    syft_help
    return 1
  fi
  SYFT="$bin"
}

# Emit the normalized CycloneDX JSON to stdout. Every mode reads from this, so
# the syft invocation and normalization live in exactly one place.
generate() {
  local stage
  stage="$(mktemp -d)"
  # Clean up the staging tree and the transient yarn.lock on any exit.
  trap 'rm -rf "$stage" "$ROOT/frontend/yarn.lock"' RETURN

  mkdir -p "$stage/backend" "$stage/frontend"
  cp "$ROOT/backend/Cargo.lock" "$stage/backend/Cargo.lock"

  # Derive a complete, deterministic yarn.lock from bun.lock, then stage it.
  ( cd "$ROOT/frontend" && bun install --frozen-lockfile --yarn ) >/dev/null 2>&1
  mv "$ROOT/frontend/yarn.lock" "$stage/frontend/yarn.lock"

  "$SYFT" "$stage" \
    --override-default-catalogers 'rust-cargo-lock-cataloger,javascript-lock-cataloger' \
    --source-name solidstart-demo \
    -o cyclonedx-json@1.6 \
  | jq '
      del(.serialNumber, .metadata.timestamp)
      | .["$schema"] = "https://cyclonedx.org/schema/bom-1.6.schema.json"
      | .metadata.tools.components |= map(if has("author") then .publisher = .author | del(.author) else . end)
      | .metadata.component."bom-ref" = "solidstart-demo"
      | .components |= (map(select(.type != "file")) | sort_by(.["bom-ref"]))
      | .dependencies |= (sort_by(.ref) | map(.dependsOn |= sort))
    '
}

mode="${1:-check}"

case "$mode" in
  write | check) ensure_syft ;;
esac

case "$mode" in
  write)
    generate > "$SBOM"
    echo "Wrote $SBOM"
    ;;
  check)
    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' EXIT
    generate > "$tmp"
    if ! diff -u "$SBOM" "$tmp" >/dev/null 2>&1; then
      echo "SBOM is stale. Run 'cgs sbom' and commit /sbom.cdx.json." >&2
      diff -u "$SBOM" "$tmp" >&2 || true
      exit 1
    fi
    echo "SBOM is current."
    ;;
  *)
    echo "usage: sbom.sh {write|check}" >&2
    exit 2
    ;;
esac
