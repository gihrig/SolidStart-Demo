#!/usr/bin/env bash
#
# cgs vex:rm — remove a VEX statement from /vex.openvex.json by advisory id
# (ADR-0022, #142 follow-up). vexctl has no remove command, so this edits the
# document with jq: it drops the matching statement(s), bumps `version`, and
# refreshes the top-level `timestamp`. It fails if nothing matches, so a typo
# cannot silently no-op.
#
# Two input modes (the `cgs` runner forwards no positional args):
#   - Env mode (use with cgs):
#       cgs vex:rm -e VEX_VULN=GHSA-67mh-4wv8-2f99
#       cgs vex:rm -e VEX_VULN=<id> -e VEX_PRODUCT=<purl>   # disambiguate one product
#   - Direct mode (call the script):
#       ./scripts/vex-rm.sh <vuln-id> [purl]
#
# VEX_PRODUCT / [purl] is optional: without it every statement for the advisory
# is removed; with it, only the statement whose product matches that purl.
# After removing, run `cgs vex:check` and commit /vex.openvex.json.
# GRYPE_VEX_FILE overrides the document path.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VEX="${GRYPE_VEX_FILE:-$ROOT/vex.openvex.json}"

vuln="${1:-${VEX_VULN:-}}"
product="${2:-${VEX_PRODUCT:-}}"

if [[ ! -f "$VEX" ]]; then
  echo "vex:rm: $VEX not found." >&2
  exit 1
fi
if [[ -z "$vuln" ]]; then
  echo "usage (cgs):    cgs vex:rm -e VEX_VULN=<id> [-e VEX_PRODUCT=<purl>]" >&2
  echo "usage (script): ./scripts/vex-rm.sh <vuln-id> [purl]" >&2
  exit 2
fi

# The jq test that identifies a statement to remove: advisory id matches, and —
# if a product filter was given — one of its products matches that purl.
match='.vulnerability.name == $v and ($p == "" or any(.products[]?; (.["@id"] == $p) or (.identifiers.purl == $p)))'

# Fail loudly when nothing matches, rather than writing an unchanged file.
n="$(jq --arg v "$vuln" --arg p "$product" "[.statements[] | select($match)] | length" "$VEX")"
if [[ "$n" -eq 0 ]]; then
  echo "vex:rm: no statement matches vuln '$vuln'${product:+ product '$product'} in $VEX." >&2
  exit 1
fi

tmp="$(mktemp)"
jq --arg v "$vuln" --arg p "$product" "
  .statements |= map(select(($match) | not))
  | .version += 1
  | .timestamp = (now | todateiso8601)
" "$VEX" > "$tmp" && mv "$tmp" "$VEX"

echo "vex:rm: removed $n statement(s) for $vuln from $VEX. Run 'cgs vex:check' and commit the file."
