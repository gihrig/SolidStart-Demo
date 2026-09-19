#!/usr/bin/env bash
#
# Test for the VEX validity guard (scripts/vex-check.sh; ADR-0022, #142). Proves
# the two properties the CI step depends on:
#   1. Live    — a statement whose (purl, vuln) IS a current finding passes.
#   2. Orphan  — a statement whose (purl, vuln) matches no finding fails.
#
# Both cases run the REAL grype against the log4j vuln fixture. The live case
# reads the finding's IDs from grype, so it does not hard-code advisory IDs that
# drift. The orphan case names a package that is not in the fixture at all.
#
#   scripts/vex-check.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK="$ROOT/scripts/vex-check.sh"
FIX="$ROOT/scripts/fixtures/grype"
PURL="pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Run the guard over a fixture SBOM with a given VEX. Sets REPORT and RC.
run_check() {  # $1 = vex file, $2 = sbom
  if REPORT="$(GRYPE_VEX_FILE="$1" "$CHECK" "$2" 2>&1)"; then RC=0; else RC=$?; fi
}

echo "1/2 live: a statement matching a current finding must pass"
id="$(grype "sbom:$FIX/vuln.cdx.json" -o json 2>/dev/null \
  | jq -r '[.matches[] | select(.vulnerability.severity=="Critical")][0].vulnerability.id')"
jq -n --arg v "$id" --arg p "$PURL" '{
  "@context":"https://openvex.dev/ns/v0.2.0","@id":"vex-test-live","author":"t","timestamp":"2026-09-19T00:00:00Z","version":1,
  statements:[{vulnerability:{name:$v},products:[{"@id":$p,identifiers:{purl:$p}}],status:"not_affected",justification:"vulnerable_code_not_in_execute_path"}]
}' > "$TMP/live.vex.json"
run_check "$TMP/live.vex.json" "$FIX/vuln.cdx.json"
if [[ "$RC" -ne 0 ]] || ! grep -q "match a current finding" <<<"$REPORT"; then
  echo "FAIL: the guard rejected a statement that matches a live finding (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — live statement passes"

echo "2/2 orphan: a statement matching no finding must fail"
jq -n '{
  "@context":"https://openvex.dev/ns/v0.2.0","@id":"vex-test-orphan","author":"t","timestamp":"2026-09-19T00:00:00Z","version":1,
  statements:[{vulnerability:{name:"GHSA-0000-0000-0000"},products:[{"@id":"pkg:npm/not-a-real-package@9.9.9",identifiers:{purl:"pkg:npm/not-a-real-package@9.9.9"}}],status:"not_affected",justification:"vulnerable_code_not_in_execute_path"}]
}' > "$TMP/orphan.vex.json"
run_check "$TMP/orphan.vex.json" "$FIX/vuln.cdx.json"
if [[ "$RC" -eq 0 ]] || ! grep -q "STALE statement" <<<"$REPORT"; then
  echo "FAIL: the guard did not flag an orphaned statement (rc=$RC)." >&2
  echo "$REPORT" >&2
  exit 1
fi
echo "  ok — orphan statement fails"

echo "PASS"
