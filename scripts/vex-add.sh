#!/usr/bin/env bash
#
# cgs vex:add — append a VEX statement to /vex.openvex.json with vexctl
# (ADR-0022, #142 follow-up). vexctl bumps the document `version`, timestamps the
# statement, and validates the status/justification against the OpenVEX spec, so
# this wrapper only fixes the document path and collects the fields.
#
# Two input modes, because the `cgs` runner forwards NO positional args:
#   - Env mode (use with cgs): pass fields as environment variables.
#       cgs vex:add -e VEX_PRODUCT=pkg:npm/esbuild@0.18.7 \
#                   -e VEX_VULN=GHSA-67mh-4wv8-2f99 \
#                   -e VEX_JUSTIFICATION=vulnerable_code_not_in_execute_path \
#                   -e VEX_IMPACT="dev server never started; build-time transform only"
#   - Flag mode (call the script directly): any args pass straight to vexctl.
#       ./scripts/vex-add.sh --product pkg:npm/x@1 --vuln CVE-1 --status not_affected \
#                            --justification component_not_present
#
# Env fields: VEX_PRODUCT (purl, required), VEX_VULN (id, required),
# VEX_STATUS (default not_affected), VEX_JUSTIFICATION (required when
# status=not_affected), VEX_IMPACT (optional). See valid values with
# `vexctl list status` and `vexctl list justification`.
#
# After adding, run `cgs vex:check` to confirm the statement matches a real
# finding, then commit /vex.openvex.json. GRYPE_VEX_FILE overrides the doc path.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VEX="${GRYPE_VEX_FILE:-$ROOT/vex.openvex.json}"

if ! command -v vexctl >/dev/null 2>&1; then
  echo "vex:add: vexctl not found. Install it: brew install vexctl" >&2
  exit 1
fi
if [[ ! -f "$VEX" ]]; then
  echo "vex:add: $VEX not found. Create it first (see vex.openvex.json)." >&2
  exit 1
fi

usage() {
  echo "usage (cgs):    cgs vex:add -e VEX_PRODUCT=<purl> -e VEX_VULN=<id> \\" >&2
  echo "                  [-e VEX_STATUS=not_affected] [-e VEX_JUSTIFICATION=<j>] [-e VEX_IMPACT=<text>]" >&2
  echo "usage (script): ./scripts/vex-add.sh --product <purl> --vuln <id> --status <s> [--justification <j>]" >&2
  echo "valid values:   vexctl list status ; vexctl list justification" >&2
}

if [[ $# -gt 0 ]]; then
  # Flag mode: forward everything to vexctl (it validates required fields).
  vexctl add --in-place "$VEX" "$@"
else
  # Env mode (cgs -e KEY=VALUE). Require the two essentials for a clear error.
  if [[ -z "${VEX_PRODUCT:-}" || -z "${VEX_VULN:-}" ]]; then
    usage
    exit 2
  fi
  args=(--product "$VEX_PRODUCT" --vuln "$VEX_VULN" --status "${VEX_STATUS:-not_affected}")
  [[ -n "${VEX_JUSTIFICATION:-}" ]] && args+=(--justification "$VEX_JUSTIFICATION")
  [[ -n "${VEX_IMPACT:-}" ]] && args+=(--impact-statement "$VEX_IMPACT")
  vexctl add --in-place "$VEX" "${args[@]}"
fi

echo "vex:add: appended to $VEX. Run 'cgs vex:check' to validate, then commit the file."
