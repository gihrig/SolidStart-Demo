#!/usr/bin/env bash
#
# Test for the pre-push convenience gate (grype, offline; ADR-0022 / spec #137,
# T2; #143). The wrapper adds to the shared gate (scripts/grype-scan.sh):
#   * OFFLINE grype (GRYPE_DB_AUTO_UPDATE=false, cached DB, no network per push).
#   * Next-steps guidance printed on any failure.
#   * Scans the PUSHED refs, not the working tree: git feeds the refs on stdin,
#     and the wrapper scans each ref's committed sbom.cdx.json.
#
# Cases:
#   1. Offline    — the wrapper exports GRYPE_DB_AUTO_UPDATE=false to grype.
#   2. Blocks     — a finding (grype exit 2) fails and prints the bypass hint.
#   3. Passes     — a clean scan (grype exit 0) passes, no guidance.
#   4. Tool error — a tool error (grype exit 1) fails and prints the DB hint.
#   5. Pushed ref — a ref on stdin makes the wrapper scan that ref's SBOM.
#   6. Deletion   — an all-zero ref sha is skipped, nothing is scanned.
#   7. No SBOM    — a ref with no sbom.cdx.json is skipped with a notice.
#   8. Hook file  — the tracked frontend/.vite-hooks/pre-push runs the wrapper
#                   and, with no pushed refs, scans the working-tree SBOM.
#
# grype is a STUB on PATH: it echoes the offline env var and its args, then exits
# a chosen code. So the run needs no grype DB and does not flap. Cases 5-7 use a
# REAL sha from this repo (git show against HEAD / the empty tree), which is how
# the wrapper resolves a pushed ref's SBOM.
#
#   scripts/pre-push-scan.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRAP="$ROOT/scripts/pre-push-scan.sh"
HOOK="$ROOT/frontend/.vite-hooks/pre-push"
FIX="$ROOT/scripts/fixtures/grype"

STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT

# (Re)write the stub grype with a chosen exit code. It echoes the offline env var
# and its args so the tests can assert both.
make_stub() {
  cat >"$STUB_DIR/grype" <<STUB
#!/usr/bin/env bash
echo "stub grype: GRYPE_DB_AUTO_UPDATE=\${GRYPE_DB_AUTO_UPDATE:-<unset>} args: \$*"
exit $1
STUB
  chmod +x "$STUB_DIR/grype"
}

# Direct mode: scan a fixture SBOM path. $1 = stub exit code. Sets REPORT + RC.
run_direct() {
  make_stub "$1"
  if REPORT="$(PATH="$STUB_DIR:$PATH" "$WRAP" "$FIX/clean.cdx.json" 2>&1)"; then RC=0; else RC=$?; fi
}

# Hook mode: feed pushed-ref lines on stdin, no path argument. $1 = stub exit
# code, $2 = stdin text. Sets REPORT + RC.
run_hook_mode() {
  make_stub "$1"
  if REPORT="$(printf '%s\n' "$2" | PATH="$STUB_DIR:$PATH" "$WRAP" 2>&1)"; then RC=0; else RC=$?; fi
}

HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD)"
# The well-known empty-tree object exists in every repo and has no sbom.cdx.json.
EMPTY_TREE="$(git -C "$ROOT" hash-object -t tree /dev/null)"

echo "1/8 offline: the wrapper must export GRYPE_DB_AUTO_UPDATE=false to grype"
run_direct 0
if ! grep -q "GRYPE_DB_AUTO_UPDATE=false" <<<"$REPORT"; then
  echo "FAIL: the wrapper did not set grype offline (GRYPE_DB_AUTO_UPDATE=false)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — grype runs offline"

echo "2/8 blocks: a finding (grype exit 2) must fail and show the bypass hint"
run_direct 2
if [[ "$RC" -eq 0 ]] \
  || ! grep -q "high or critical vulnerabilities found" <<<"$REPORT" \
  || ! grep -q "git push --no-verify" <<<"$REPORT"; then
  echo "FAIL: a finding did not block with the next-steps guidance (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — a finding blocks and prints the bypass hint"

echo "3/8 passes: a clean scan (grype exit 0) must pass with no guidance"
run_direct 0
if [[ "$RC" -ne 0 ]] \
  || ! grep -q "no high or critical vulnerabilities" <<<"$REPORT" \
  || grep -q "Next steps" <<<"$REPORT"; then
  echo "FAIL: a clean scan did not pass cleanly (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — a clean scan passes, no guidance"

echo "4/8 tool error: grype exit 1 must fail and show the DB-update hint"
run_direct 1
if [[ "$RC" -eq 0 ]] \
  || ! grep -q "tool error" <<<"$REPORT" \
  || ! grep -q "grype db update" <<<"$REPORT"; then
  echo "FAIL: a tool error did not block with the DB-update guidance (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — a tool error blocks and prints the DB-update hint"

echo "5/8 pushed ref: a ref on stdin must make the wrapper scan that ref's SBOM"
# HEAD carries sbom.cdx.json; the stub blocks (exit 2). A block proves the wrapper
# read the ref, extracted its SBOM, and scanned it.
run_hook_mode 2 "refs/heads/x $HEAD_SHA refs/heads/x $HEAD_SHA"
if [[ "$RC" -eq 0 ]] || ! grep -q "git push --no-verify" <<<"$REPORT"; then
  echo "FAIL: a pushed ref's SBOM was not scanned/blocked (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — the pushed ref's committed SBOM is scanned"

echo "6/8 deletion: an all-zero ref sha must be skipped, nothing scanned"
# Stub exits 2, but a deletion scans nothing, so grype is never called: the run
# must pass. If the wrapper wrongly fell back to the working tree, it would block.
zero="0000000000000000000000000000000000000000"
run_hook_mode 2 "(delete) $zero refs/heads/x $HEAD_SHA"
if [[ "$RC" -ne 0 ]] \
  || grep -q "stub grype" <<<"$REPORT" \
  || ! grep -q "nothing scanned" <<<"$REPORT"; then
  echo "FAIL: a ref deletion was not skipped cleanly (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — a ref deletion scans nothing and passes"

echo "7/8 no SBOM: a ref with no sbom.cdx.json must be skipped with a notice"
run_hook_mode 2 "refs/heads/x $EMPTY_TREE refs/heads/x $HEAD_SHA"
if [[ "$RC" -ne 0 ]] \
  || grep -q "stub grype" <<<"$REPORT" \
  || ! grep -q "has no sbom.cdx.json; skipping" <<<"$REPORT"; then
  echo "FAIL: a ref without an SBOM was not skipped with a notice (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — a ref without an SBOM is skipped with a notice"

echo "8/8 hook file: the tracked hook must run the wrapper and gate the working-tree SBOM"
# Run the real hook file the way git does (its $0 resolves the repo root), with no
# pushed refs on stdin. It must invoke grype on the working-tree sbom.cdx.json.
make_stub 0
if REPORT="$(PATH="$STUB_DIR:$PATH" sh "$HOOK" </dev/null 2>&1)"; then RC=0; else RC=$?; fi
if [[ "$RC" -ne 0 ]] || ! grep -q "args: sbom:$ROOT/sbom.cdx.json" <<<"$REPORT"; then
  echo "FAIL: the hook file did not gate the working-tree SBOM (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — the tracked hook runs the wrapper and gates the default SBOM"

echo "PASS"
