#!/usr/bin/env bash
#
# Pre-push convenience gate (ADR-0022, #143). Runs the project-wide grype gate
# over the committed SBOM and blocks a push on a high/critical finding. It is a
# LOCAL convenience gate: the PR CI job (`grype-scan`) is the real enforcement.
# Bypass in an emergency with `git push --no-verify`.
#
# The pre-push git hook (frontend/.vite-hooks/pre-push) calls this. It exists as
# its own script, not inline in the hook, so scripts/pre-push-scan.test.sh can
# prove it and so it mirrors the other gate scripts under scripts/.
#
# This runs the SAME gate `cgs scan` runs — scripts/grype-scan.sh (Scripts.toml:
# `scan`). It adds two things:
#   1. It forces grype OFFLINE with GRYPE_DB_AUTO_UPDATE=false, so a push uses
#      the cached DB and never waits on the network. grype fails a scan if its DB
#      is missing or over five days old (ADR-0022); the wrapper does NOT update
#      it, which keeps the push fast and offline. A missing/stale DB then blocks
#      the push as a tool error (per issue #143: always block).
#   2. On any failure it prints the next steps a developer needs — grype-scan.sh
#      says WHICH case failed; this says how to fix it (install grype, update the
#      DB, or bypass). CI shares grype-scan.sh, so that advice belongs here, not
#      there.
#
#   scripts/pre-push-scan.sh              # scan /sbom.cdx.json (the hook)
#   scripts/pre-push-scan.sh <sbom-path>  # scan another SBOM   (the test uses this)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Offline + fast: use the cached grype DB, never hit the network on a push.
export GRYPE_DB_AUTO_UPDATE=false

# Run the shared gate. Capture its exit instead of exec-ing, so a failure can
# print the next steps below. "$@" lets the test point at a fixture SBOM, and
# defaults to /sbom.cdx.json for the hook.
rc=0
"$ROOT/scripts/grype-scan.sh" "$@" || rc=$?
[[ "$rc" -eq 0 ]] && exit 0

# The gate blocked the push: a finding, or a tool error (grype missing / stale
# DB / bad SBOM). grype-scan.sh already printed which; add how to fix each.
cat >&2 <<EOF
pre-push: the grype gate blocked this push (exit $rc). Next steps:
  - Vulnerability: fix or accept the high/critical finding (see 'cgs vex').
  - grype not installed: install grype (CI pins v0.119.0).
  - DB missing or stale: run 'grype db update' (this hook runs offline).
  - Emergency bypass: git push --no-verify (CI still enforces the gate).
EOF
exit "$rc"
