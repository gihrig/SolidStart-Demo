#!/usr/bin/env bash
#
# Test for the pre-push convenience gate (grype, offline; ADR-0022 / spec #137,
# T2; #143). The wrapper adds two things to the shared gate
# (scripts/grype-scan.sh): it forces grype OFFLINE (GRYPE_DB_AUTO_UPDATE=false,
# cached DB, no network per push), and on any failure it prints the next steps a
# developer needs (fix/accept, install grype, update the DB, or bypass). This
# test proves both, deterministically:
#   1. Offline    — the wrapper exports GRYPE_DB_AUTO_UPDATE=false to grype.
#   2. Blocks     — a gating finding (grype exit 2) fails the wrapper and prints
#                   the bypass hint.
#   3. Passes     — a clean scan (grype exit 0) passes the wrapper.
#   4. Tool error — a tool error (grype exit 1) fails the wrapper and prints the
#                   DB-update hint.
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

echo "1/4 offline: the wrapper must export GRYPE_DB_AUTO_UPDATE=false to grype"
run_wrap_stub 0
if ! grep -q "GRYPE_DB_AUTO_UPDATE=false" <<<"$REPORT"; then
  echo "FAIL: the wrapper did not set grype offline (GRYPE_DB_AUTO_UPDATE=false)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — grype runs offline"

echo "2/4 blocks: a gating finding (grype exit 2) must fail and show the bypass hint"
run_wrap_stub 2
if [[ "$RC" -eq 0 ]] \
  || ! grep -q "high or critical vulnerabilities found" <<<"$REPORT" \
  || ! grep -q "git push --no-verify" <<<"$REPORT"; then
  echo "FAIL: a finding did not block with the next-steps guidance (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — a finding blocks and prints the bypass hint"

echo "3/4 passes: a clean scan (grype exit 0) must pass with no guidance"
run_wrap_stub 0
if [[ "$RC" -ne 0 ]] \
  || ! grep -q "no high or critical vulnerabilities" <<<"$REPORT" \
  || grep -q "Next steps" <<<"$REPORT"; then
  echo "FAIL: a clean scan did not pass cleanly (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — a clean scan passes, no guidance"

echo "4/4 tool error: grype exit 1 must fail and show the DB-update hint"
run_wrap_stub 1
if [[ "$RC" -eq 0 ]] \
  || ! grep -q "tool error" <<<"$REPORT" \
  || ! grep -q "grype db update" <<<"$REPORT"; then
  echo "FAIL: a tool error did not block with the DB-update guidance (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — a tool error blocks and prints the DB-update hint"

echo "PASS"
