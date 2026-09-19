#!/usr/bin/env bash
#
# cgs vex — print the VEX maintenance cheat-sheet for /vex.openvex.json.
# The individual actions live in vex-add.sh / vex-rm.sh / vex-check.sh and
# grype-scan.sh. This script only prints; it changes nothing. (ADR-0022, #142.)
set -euo pipefail

cat <<'EOF'
VEX maintenance for /vex.openvex.json  (OpenVEX + grype; see ADR-0022)
Tools: grype, jq, vexctl (brew install vexctl). vexctl is local-only, not in CI.

1. Find the values for a statement (severity, purl, advisory id):
     grype "sbom:sbom.cdx.json" -o json \
       | jq -r '.matches[] | "\(.vulnerability.severity)\t\(.artifact.purl)\t\(.vulnerability.id)"'
   VEX_PRODUCT = the purl, VEX_VULN = the advisory id.

2. Add a not_affected statement:
     cgs vex:add -e VEX_PRODUCT=<purl> -e VEX_VULN=<id> \
                 -e VEX_JUSTIFICATION=<j> -e VEX_IMPACT="<why not exploitable>"
   Valid values: vexctl list status ; vexctl list justification
   VEX_STATUS defaults to not_affected.

3. Remove a stale statement:
     cgs vex:rm -e VEX_VULN=<id> [-e VEX_PRODUCT=<purl>]

4. Check the document (fails if a statement matches no current finding):
     cgs vex:check

5. Re-scan the SBOM with the VEX applied (the gate):
     cgs scan

Roles: grype finds, vexctl authors (add), jq removes (rm),
       vex:check validates, a human decides the justification.
After any add/rm: run `cgs vex:check`, then commit /vex.openvex.json.
EOF
