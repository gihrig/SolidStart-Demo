#!/usr/bin/env bash
#
# Test for the back-end RustSec gate (cargo-audit, #139, ADR-0022 / spec #137).
# Proves the four properties the CI `cargo-audit` job depends on:
#   1. Advisory    — a known vulnerability makes the scan fail (exit non-zero).
#   2. Clean       — a lockfile with no advisory makes the scan pass (exit 0).
#   3. RustSec-only — `--deny warnings` also fails on an "unmaintained" advisory,
#                     the signal grype does not carry.
#   4. Ignore-list — an accepted advisory in .cargo/audit.toml is neutralized,
#                    so a triaged risk does not block the build forever.
# Every check uses the same flags the `cgs audit` recipe uses
# (`cargo audit --deny warnings`); keep them in step if the recipe changes.
#
# A fail-case asserts the exact RUSTSEC id in the report, not just a non-zero
# exit. cargo-audit also exits non-zero on a tool error (e.g. an unreachable
# advisory DB or an unreadable lockfile), so an exit-code-only test would let a
# broken run masquerade as detection. Grepping the id tells the two apart.
#
#   scripts/cargo-audit.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIX="$ROOT/scripts/fixtures/cargo-audit"
VULN_ID="RUSTSEC-2020-0071"     # time <0.2.23 segfault; pinned in vuln/Cargo.lock
UNMAINT_ID="RUSTSEC-2021-0141"  # dotenv unmaintained; pinned in unmaintained/Cargo.lock

# Run the gate on a fixture lockfile. Sets REPORT (combined stdout+stderr) and RC
# (0 = clean, non-zero = advisory found OR tool error). The `if` guards set -e.
run_gate() {
  if REPORT="$(cargo audit --deny warnings -f "$1" 2>&1)"; then RC=0; else RC=$?; fi
}

echo "1/4 advisory: vuln fixture must report $VULN_ID"
run_gate "$FIX/vuln/Cargo.lock"
if [[ "$RC" -eq 0 ]] || ! grep -q "$VULN_ID" <<<"$REPORT"; then
  echo "FAIL: vuln fixture did not report $VULN_ID (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — advisory detected"

echo "2/4 clean: clean fixture must pass"
run_gate "$FIX/clean/Cargo.lock"
if [[ "$RC" -ne 0 ]]; then
  echo "FAIL: clean fixture tripped the gate (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — no advisory"

echo "3/4 rustsec-only: unmaintained fixture must report $UNMAINT_ID under --deny warnings"
run_gate "$FIX/unmaintained/Cargo.lock"
if [[ "$RC" -eq 0 ]] || ! grep -q "$UNMAINT_ID" <<<"$REPORT"; then
  echo "FAIL: --deny warnings did not report $UNMAINT_ID (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — unmaintained caught"

echo "4/4 ignore-list: $VULN_ID accepted in .cargo/audit.toml must pass"
# cargo-audit reads .cargo/audit.toml from the working directory. Stage the vuln
# lockfile beside an ignore-list that accepts its advisory, then scan from there.
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/.cargo"
cp "$FIX/vuln/Cargo.lock" "$stage/Cargo.lock"
printf '[advisories]\nignore = ["%s"]\n' "$VULN_ID" > "$stage/.cargo/audit.toml"
if ! ( cd "$stage" && cargo audit --deny warnings -q >/dev/null 2>&1 ); then
  echo "FAIL: ignore-list did not neutralize $VULN_ID." >&2
  exit 1
fi
echo "  ok — accepted advisory ignored"

echo "PASS"
