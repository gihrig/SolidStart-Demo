#!/usr/bin/env bash
#
# Test for the project-wide vulnerability gate (grype, ADR-0022 / spec #137, T2;
# #142). Proves the four exit-code branches the CI `grype-scan` job depends on:
#   1. Finding    — a planted high/critical vulnerability fails the gate (grype 2).
#   2. Clean      — an SBOM with no known vulnerability passes the gate (grype 0).
#   3. DB upgrade — grype exit 100 passes with a notice, NOT a failure.
#   4. Tool error — any other non-zero exit fails the gate as a tool error.
#
# Cases 1-2 run the REAL grype against fixtures, so they prove grype integration.
# Fixtures are minimal CycloneDX 1.6 SBOMs, not the real /sbom.cdx.json: the real
# SBOM's finding state changes as new CVEs are disclosed, so a test that scanned
# it would flap. The vuln fixture pins log4j-core 2.14.1 (CVE-2021-44228 /
# GHSA-jfh8-c2jp-5v3q, Critical) — a stable, always-known finding. The clean
# fixture holds one package no advisory DB matches.
#
# Cases 3-4 drive the exit code with a STUB `grype` on PATH, because grype rarely
# emits 100 (only `db check`) and a tool error is hard to force reliably. Testing
# the mapping deterministically stops a regression that swaps the 100 and error
# branches from leaving the tests green.
#
# Each case asserts the gate's own marker line, not just the exit code: the
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

# A stub `grype` on PATH returns a chosen exit code, so the wrapper's exit-code
# mapping can be tested without the real tool or its DB. $1 = the exit code.
STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT
run_gate_stub() {
  cat >"$STUB_DIR/grype" <<STUB
#!/usr/bin/env bash
echo "stub grype: forced exit $1"
exit $1
STUB
  chmod +x "$STUB_DIR/grype"
  # Prepend the stub dir so \`grype\` resolves to it; scan a real fixture path so
  # the wrapper's existence check passes before it calls grype.
  if REPORT="$(PATH="$STUB_DIR:$PATH" "$SCAN" "$FIX/clean.cdx.json" 2>&1)"; then RC=0; else RC=$?; fi
}

echo "1/4 finding: the vuln fixture must fail the gate"
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

echo "2/4 clean: the clean fixture must pass the gate"
run_gate "$FIX/clean.cdx.json"
if [[ "$RC" -ne 0 ]] || ! grep -q "no high or critical vulnerabilities" <<<"$REPORT"; then
  echo "FAIL: the gate did not pass on a clean SBOM (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — clean SBOM passes"

echo "3/4 DB upgrade: grype exit 100 must pass with a notice, not fail"
run_gate_stub 100
if [[ "$RC" -ne 0 ]] || ! grep -q "DB upgrade is available" <<<"$REPORT"; then
  echo "FAIL: exit 100 did not pass with the DB-upgrade notice (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — exit 100 passes with a notice"

echo "4/4 tool error: any other non-zero exit must fail as a tool error"
run_gate_stub 1
if [[ "$RC" -eq 0 ]] || ! grep -q "tool error" <<<"$REPORT"; then
  echo "FAIL: a tool error did not fail the gate with the tool-error marker (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — tool error fails distinctly"

echo "PASS"
