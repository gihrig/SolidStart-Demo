#!/usr/bin/env bash
#
# Test for the project-wide SBOM (ADR-0022, #138). Proves two properties the
# drift guard depends on:
#   1. Determinism — two full generations are byte-identical.
#   2. Coverage — the SBOM holds at least one pkg:cargo and one pkg:npm
#      component, so both ecosystems are inventoried.
# The CI `sbom-drift` job runs this alongside `scripts/sbom.sh check`.
#
#   scripts/sbom.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SBOM_SH="$ROOT/scripts/sbom.sh"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

echo "1/2 determinism: two generations must be byte-identical"
# `write` emits to /sbom.cdx.json; run it twice and copy the result each time.
"$SBOM_SH" write >/dev/null
cp "$ROOT/sbom.cdx.json" "$tmpdir/a.json"
"$SBOM_SH" write >/dev/null
cp "$ROOT/sbom.cdx.json" "$tmpdir/b.json"
if ! diff -u "$tmpdir/a.json" "$tmpdir/b.json"; then
  echo "FAIL: two SBOM generations differ." >&2
  exit 1
fi
echo "  ok — identical"

echo "2/2 coverage: at least one pkg:cargo and one pkg:npm component"
cargo_n="$(jq '[.components[].purl // empty | select(startswith("pkg:cargo"))] | length' "$ROOT/sbom.cdx.json")"
npm_n="$(jq '[.components[].purl // empty | select(startswith("pkg:npm"))] | length' "$ROOT/sbom.cdx.json")"
echo "  pkg:cargo=$cargo_n pkg:npm=$npm_n"
if [[ "$cargo_n" -lt 1 || "$npm_n" -lt 1 ]]; then
  echo "FAIL: need >=1 pkg:cargo and >=1 pkg:npm." >&2
  exit 1
fi

echo "PASS"
