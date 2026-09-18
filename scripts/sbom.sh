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
set -euo pipefail

# Resolve repo root from this script's location so it runs from any cwd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SBOM="$ROOT/sbom.cdx.json"

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

  syft "$stage" \
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
