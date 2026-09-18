#!/usr/bin/env bash
#
# Test for the project-wide vulnerability gate (grype, ADR-0022 / spec #137, T2;
# #142). Proves the two properties the CI `grype-scan` job depends on:
#   1. Finding — a planted high/critical vulnerability fails the gate.
#   2. Clean   — an SBOM with no known vulnerability passes the gate.
#
# The fixtures are minimal CycloneDX 1.6 SBOMs, not the real /sbom.cdx.json: the
# real SBOM's finding state changes as new CVEs are disclosed, so a test that
# scanned it would flap. The vuln fixture pins log4j-core 2.14.1
# (CVE-2021-44228 / GHSA-jfh8-c2jp-5v3q, Critical) — a stable, always-known
# finding. The clean fixture holds one package no advisory DB matches.
#
# Each case asserts the gate's own marker line, not just the exit code: grype's
# tool-error path also exits non-zero, so an exit-code-only test would let a
# broken run (a DB-load failure, a malformed SBOM) masquerade as detection.
# Matching the marker tells a real finding apart from a crash.
#
#   scripts/grype-scan.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCAN="$ROOT/scripts/grype-scan.sh"
FIX="$ROOT/scripts/fixtures/grype"

# Run the gate over one fixture SBOM. Sets REPORT (stdout+stderr) and RC.
run_gate() {
  if REPORT="$("$SCAN" "$1" 2>&1)"; then RC=0; else RC=$?; fi
}

echo "1/2 finding: the vuln fixture must fail the gate"
run_gate "$FIX/vuln.cdx.json"
# Two assertions, like the sibling gate tests: a grype-native token
# (`log4j-core`, the planted package) proves grype actually MATCHED the finding,
# and the wrapper's marker proves the exit-code mapping fired — not a crash.
if [[ "$RC" -eq 0 ]] \
  || ! grep -q "log4j-core" <<<"$REPORT" \
  || ! grep -q "high or critical vulnerabilities found" <<<"$REPORT"; then
  echo "FAIL: the gate did not fail on a planted high/critical finding (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — finding trips the gate"

echo "2/2 clean: the clean fixture must pass the gate"
run_gate "$FIX/clean.cdx.json"
if [[ "$RC" -ne 0 ]] || ! grep -q "no high or critical vulnerabilities" <<<"$REPORT"; then
  echo "FAIL: the gate did not pass on a clean SBOM (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — clean SBOM passes"

echo "PASS"
