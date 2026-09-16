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
#   scripts/cargo-audit.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIX="$ROOT/scripts/fixtures/cargo-audit"
IGNORED_ID="RUSTSEC-2020-0071"   # time <0.2.23 segfault; pinned in vuln/Cargo.lock

# The gate: exit 0 = clean, non-zero = advisory found. Scanning a fixture with
# `-f` keeps the project's own lockfile out of the test.
audit() { cargo audit --deny warnings -q -f "$1" >/dev/null 2>&1; }

echo "1/4 advisory: vuln fixture must fail"
if audit "$FIX/vuln/Cargo.lock"; then
  echo "FAIL: vuln fixture did not trip the gate." >&2
  exit 1
fi
echo "  ok — advisory detected"

echo "2/4 clean: clean fixture must pass"
if ! audit "$FIX/clean/Cargo.lock"; then
  echo "FAIL: clean fixture tripped the gate." >&2
  exit 1
fi
echo "  ok — no advisory"

echo "3/4 rustsec-only: unmaintained fixture must fail under --deny warnings"
if audit "$FIX/unmaintained/Cargo.lock"; then
  echo "FAIL: --deny warnings did not catch the unmaintained advisory." >&2
  exit 1
fi
echo "  ok — unmaintained caught"

echo "4/4 ignore-list: an accepted advisory in .cargo/audit.toml must pass"
# cargo-audit reads .cargo/audit.toml from the working directory. Stage the vuln
# lockfile beside an ignore-list that accepts its advisory, then scan from there.
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/.cargo"
cp "$FIX/vuln/Cargo.lock" "$stage/Cargo.lock"
printf '[advisories]\nignore = ["%s"]\n' "$IGNORED_ID" > "$stage/.cargo/audit.toml"
if ! ( cd "$stage" && cargo audit --deny warnings -q >/dev/null 2>&1 ); then
  echo "FAIL: ignore-list did not neutralize $IGNORED_ID." >&2
  exit 1
fi
echo "  ok — accepted advisory ignored"

echo "PASS"
