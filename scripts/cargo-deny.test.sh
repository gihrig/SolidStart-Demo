#!/usr/bin/env bash
#
# Test for the back-end dependency-policy gate (cargo-deny, #140, ADR-0022 /
# spec #137, T4). Proves the four properties the CI `cargo-deny` job depends on:
#   1. Banned crate      — a banned crate makes the scan fail (error[banned]).
#   2. Disallowed lic.   — a license outside the allow-list fails (error[rejected]).
#   3. Untrusted source  — a source outside allow-registry fails
#                          (error[source-not-allowed]).
#   4. Clean             — the real policy (backend/deny.toml) passes (exit 0).
# Checks 1-3 run against the real back-end crate graph with a fixture config that
# adds one violation, because the real policy bans nothing, rejects no license,
# and allows crates.io — it cannot show its own failure modes. Check 4 runs the
# real policy.
#
# The scan runs `check licenses bans sources` — never `advisories` — so it needs
# no network (no advisory-DB fetch) and stays offline and deterministic. The
# RustSec advisory scan is the separate `cargo-audit` gate (#139).
#
# A fail-case asserts the exact cargo-deny error code (`banned` / `rejected`),
# not just a non-zero exit. cargo-deny also exits non-zero on a tool error (a
# bad config, an unreadable manifest), so an exit-code-only test would let a
# broken run masquerade as detection. Grepping the code tells the two apart.
#
#   scripts/cargo-deny.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIX="$ROOT/scripts/fixtures/cargo-deny"
MANIFEST="$ROOT/backend/Cargo.toml"

# Run the gate with a given config over the real back-end graph. Sets REPORT
# (combined stdout+stderr) and RC (0 = clean, non-zero = violation OR tool
# error). $1 = config path, rest = the checks to run. The `if` guards set -e.
run_gate() {
  local cfg="$1"; shift
  if REPORT="$(cargo deny --manifest-path "$MANIFEST" --config "$cfg" check "$@" 2>&1)"; then
    RC=0
  else
    RC=$?
  fi
}

echo "1/4 banned crate: fixture must report error[banned] for serde"
run_gate "$FIX/banned-crate.toml" bans
if [[ "$RC" -eq 0 ]] || ! grep -q "error\[banned\]" <<<"$REPORT"; then
  echo "FAIL: banned-crate fixture did not report a ban (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — banned crate detected"

echo "2/4 disallowed license: fixture must report error[rejected]"
run_gate "$FIX/disallowed-license.toml" licenses
if [[ "$RC" -eq 0 ]] || ! grep -q "error\[rejected\]" <<<"$REPORT"; then
  echo "FAIL: disallowed-license fixture did not reject a license (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — disallowed license rejected"

echo "3/4 untrusted source: fixture must report error[source-not-allowed]"
run_gate "$FIX/untrusted-source.toml" sources
if [[ "$RC" -eq 0 ]] || ! grep -q "error\[source-not-allowed\]" <<<"$REPORT"; then
  echo "FAIL: untrusted-source fixture did not reject a source (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — untrusted source rejected"

echo "4/4 clean: the real policy (backend/deny.toml) must pass"
run_gate "$ROOT/backend/deny.toml" licenses bans sources
if [[ "$RC" -ne 0 ]]; then
  echo "FAIL: the real policy tripped the gate on a clean tree (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — clean tree passes"

echo "PASS"
