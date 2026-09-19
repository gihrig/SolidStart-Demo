#!/usr/bin/env bash
#
# Project-wide vulnerability gate (ADR-0022, #142). Scans the committed
# CycloneDX SBOM with grype and fails on high or critical findings across both
# ecosystems (Rust back-end + TypeScript front-end). syft inventories; grype
# gates. This mirrors scripts/sbom.sh: one script the `cgs scan` recipe and the
# CI job both call, so the gate logic lives in exactly one place.
#
#   scripts/grype-scan.sh              # scan /sbom.cdx.json        (cgs scan)
#   scripts/grype-scan.sh <sbom-path>  # scan another SBOM (the test uses this)
#
# Threshold — `--fail-on high` (ADR-0022): grype's severity order is
# negligible < low < medium < high < critical, so the gate fails on high AND
# critical. The full npm tree makes a lower cutoff noisy.
#
# Exit codes are load-bearing (ADR-0022, verified from grype source):
#   0   scan clean — no vulnerability at or above the threshold.
#   2   vulnerabilities found at or above the threshold — THE GATE.
#   100 a DB upgrade is available; the scan itself found nothing above threshold.
#   1   any other error (bad input, DB load failure) — a tool error, not a finding.
# The common assumption "grype exits 1 on findings" is wrong: findings are 2.
# This script maps 2 to a hard failure, 100 to a pass with a notice, and any
# other non-zero to a distinct tool-error failure, so a broken run cannot
# masquerade as either a clean scan or a real finding.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SBOM="${1:-$ROOT/sbom.cdx.json}"

if [[ ! -f "$SBOM" ]]; then
  echo "grype: SBOM not found: $SBOM. Run 'cgs sbom' first." >&2
  exit 1
fi

# Run grype over the SBOM. It prints its finding table to stdout; capture the
# exit code without letting `set -e` abort on a non-zero (the `if` guards it).
if grype "sbom:$SBOM" --fail-on high; then
  rc=0
else
  rc=$?
fi

case "$rc" in
  0)
    echo "grype: no high or critical vulnerabilities."
    ;;
  2)
    echo "grype: high or critical vulnerabilities found. Gate fails." >&2
    exit 1
    ;;
  100)
    echo "grype: no high or critical vulnerabilities; a grype DB upgrade is available." >&2
    ;;
  *)
    echo "grype: tool error (exit $rc), not a vulnerability finding. Gate fails." >&2
    exit 1
    ;;
esac
