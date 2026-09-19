#!/usr/bin/env bash
#
# Test for the pre-push convenience gate (grype, offline; ADR-0022 / spec #137,
# T2; #143). The wrapper adds exactly two things to the shared gate
# (scripts/grype-scan.sh): it forces grype OFFLINE (GRYPE_DB_AUTO_UPDATE=false,
# cached DB, no network per push) and it forwards the gate's exit so a finding
# blocks the push. This test proves both, deterministically:
#   1. Offline    — the wrapper exports GRYPE_DB_AUTO_UPDATE=false to grype.
#   2. Blocks     — a gating finding (grype exit 2) fails the wrapper.
#   3. Passes     — a clean scan (grype exit 0) passes the wrapper.
#
# It drives grype with a STUB on PATH, not the real tool, for two reasons: the
# stub can print the environment grype actually received (proving case 1), and
# the run needs no grype DB, so it never flaps on a missing/stale cache. The
# REAL-grype integration of the gate itself is proven by grype-scan.test.sh; the
# wrapper only sets the env and forwards, so that is all this test covers.
#
#   scripts/pre-push-scan.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRAP="$ROOT/scripts/pre-push-scan.sh"
FIX="$ROOT/scripts/fixtures/grype"

# A stub `grype` on PATH echoes the offline env var it received, then exits with
# a chosen code so the wrapper's exit-forwarding can be tested without the real
# tool or its DB. $1 = the exit code grype should return.
STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT
run_wrap_stub() {
  # Unquoted heredoc: $1 (the exit code) interpolates now, while
  # \${GRYPE_DB_AUTO_UPDATE...} stays literal so the stub reads it at run time.
  cat >"$STUB_DIR/grype" <<STUB
#!/usr/bin/env bash
echo "stub grype: GRYPE_DB_AUTO_UPDATE=\${GRYPE_DB_AUTO_UPDATE:-<unset>}"
exit $1
STUB
  chmod +x "$STUB_DIR/grype"
  # Prepend the stub dir so `grype` resolves to it; scan the clean fixture path
  # so grype-scan.sh's SBOM existence check passes before it calls grype.
  if REPORT="$(PATH="$STUB_DIR:$PATH" "$WRAP" "$FIX/clean.cdx.json" 2>&1)"; then RC=0; else RC=$?; fi
}

echo "1/3 offline: the wrapper must export GRYPE_DB_AUTO_UPDATE=false to grype"
run_wrap_stub 0
if ! grep -q "GRYPE_DB_AUTO_UPDATE=false" <<<"$REPORT"; then
  echo "FAIL: the wrapper did not set grype offline (GRYPE_DB_AUTO_UPDATE=false)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — grype runs offline"

echo "2/3 blocks: a gating finding (grype exit 2) must fail the wrapper"
run_wrap_stub 2
if [[ "$RC" -eq 0 ]] || ! grep -q "high or critical vulnerabilities found" <<<"$REPORT"; then
  echo "FAIL: a gating finding did not block the push (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — a finding blocks the push"

echo "3/3 passes: a clean scan (grype exit 0) must pass the wrapper"
run_wrap_stub 0
if [[ "$RC" -ne 0 ]] || ! grep -q "no high or critical vulnerabilities" <<<"$REPORT"; then
  echo "FAIL: a clean scan did not pass (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — a clean scan passes"

echo "PASS"
