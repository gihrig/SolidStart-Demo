#!/usr/bin/env bash
#
# VEX validity guard (ADR-0022, #142 follow-up). Every `not_affected` (or
# `affected`) statement in the VEX document must still correspond to a REAL
# finding in the committed SBOM. A statement that matches nothing is stale — the
# dependency was fixed or removed, or its version moved — so it now suppresses
# nothing and misleads readers. This guard fails on such an orphan, mirroring
# `scripts/sbom.sh check` for SBOM drift.
#
# How: scan the SBOM WITHOUT the VEX, so a `not_affected` finding appears as a
# normal match. Collect every "purl<TAB>vuln-id" pair grype reports. Then check
# that each VEX statement's (product purl, vulnerability) is among them.
#
# `fixed` and `under_investigation` statements are skipped: a `fixed` finding is
# correctly absent from a scan, so the orphan rule does not apply to it.
#
#   scripts/vex-check.sh [sbom-path]     # (cgs vex:check)
# GRYPE_VEX_FILE overrides the document path (the test uses it).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SBOM="${1:-$ROOT/sbom.cdx.json}"
VEX="${GRYPE_VEX_FILE:-$ROOT/vex.openvex.json}"

if [[ ! -f "$VEX" ]]; then
  echo "vex-check: no VEX document at $VEX; nothing to check."
  exit 0
fi
if [[ ! -f "$SBOM" ]]; then
  echo "vex-check: SBOM not found: $SBOM. Run 'cgs sbom' first." >&2
  exit 1
fi
if ! jq -e . "$VEX" >/dev/null 2>&1; then
  echo "vex-check: $VEX is not valid JSON." >&2
  exit 1
fi

# Live findings from a no-VEX scan: one "purl<TAB>vuln-id" line per match.
findings="$(grype "sbom:$SBOM" -o json 2>/dev/null \
  | jq -r '.matches[] | "\(.artifact.purl)\t\(.vulnerability.id)"' | sort -u)"

# Each asserted statement expands to "purl<TAB>vuln-id" lines (a statement may
# list several products). Prefer the purl identifier grype matches on.
claims="$(jq -r '
  .statements[]
  | select(.status == "not_affected" or .status == "affected")
  | .vulnerability.name as $v
  | .products[]
  | ((.identifiers.purl // .["@id"]) + "\t" + $v)
' "$VEX" | sort -u)"

if [[ -z "$claims" ]]; then
  echo "vex-check: no not_affected/affected statements to validate."
  exit 0
fi

stale=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  if ! grep -qxF "$line" <<<"$findings"; then
    purl="${line%%$'\t'*}"
    vid="${line##*$'\t'}"
    echo "vex-check: STALE statement — no current finding for $vid on $purl." >&2
    stale=1
  fi
done <<<"$claims"

if [[ "$stale" -ne 0 ]]; then
  echo "vex-check: remove or update the stale statement(s) in $(basename "$VEX")." >&2
  exit 1
fi

echo "vex-check: all asserted statements match a current finding."
