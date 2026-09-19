#!/usr/bin/env bash
#
# Pre-push convenience gate (ADR-0022, #143). Runs the project-wide grype gate
# over the SBOM and blocks a push on a high/critical finding. It is a LOCAL
# convenience gate: the PR CI job (`grype-scan`) is the real enforcement. Bypass
# in an emergency with `git push --no-verify`.
#
# The pre-push git hook (frontend/.vite-hooks/pre-push) calls this with no
# arguments and lets git's stdin flow through. It exists as its own script, not
# inline in the hook, so scripts/pre-push-scan.test.sh can prove it and so it
# mirrors the other gate scripts under scripts/.
#
# WHICH SBOM it scans:
#   * Hook mode (no argument). git feeds the refs being pushed on stdin, one per
#     line: `<local-ref> <local-sha> <remote-ref> <remote-sha>`. For each pushed
#     ref this scans that ref's COMMITTED sbom.cdx.json (`git show
#     <local-sha>:sbom.cdx.json`), NOT the working tree — so `git push origin
#     other-branch` is gated on what is actually pushed. A ref deletion (all-zero
#     sha) is skipped; a ref with no sbom.cdx.json is skipped with a notice.
#   * Direct mode (an SBOM path argument). Scans exactly the given SBOM. The test
#     uses this; a call with no stdin refs also falls back to the working-tree
#     sbom.cdx.json here.
#
# This runs the SAME gate `cgs scan` runs — scripts/grype-scan.sh (Scripts.toml:
# `scan`). It adds two things:
#   1. It forces grype OFFLINE with GRYPE_DB_AUTO_UPDATE=false, so a push uses the
#      cached DB and never waits on the network. grype fails a scan if its DB is
#      missing or over five days old (ADR-0022); the wrapper does NOT update it. A
#      missing/stale DB then blocks the push as a tool error (per #143: always
#      block).
#   2. On any failure it prints the next steps a developer needs. CI shares
#      grype-scan.sh, so that advice belongs here, not there.
#
#   scripts/pre-push-scan.sh              # hook mode: read pushed refs from stdin
#   scripts/pre-push-scan.sh <sbom-path>  # direct mode: scan one SBOM (the test)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Offline + fast: use the cached grype DB, never hit the network on a push.
export GRYPE_DB_AUTO_UPDATE=false

TMP=""
# Invoked indirectly by the trap below (SC2329 is a false positive here).
# shellcheck disable=SC2329
# return 0: a bash EXIT trap's final status becomes the shell's exit status, so a
# falsy last command here would turn a clean `exit 0` into exit 1.
cleanup() { [[ -n "$TMP" ]] && rm -f "$TMP"; return 0; }
trap cleanup EXIT

# rc is the worst gate exit seen. scan() runs the shared gate over one SBOM and
# remembers a failure without aborting (so every pushed ref is scanned).
rc=0
scan() {
  local grc=0
  "$ROOT/scripts/grype-scan.sh" "$1" || grc=$?
  [[ "$grc" -ne 0 ]] && rc="$grc"
  return 0
}

if [[ $# -gt 0 ]]; then
  # Direct mode: scan the SBOM(s) given (the test's fixture path).
  for sbom in "$@"; do scan "$sbom"; done
else
  # Hook mode: scan each pushed ref's committed SBOM, read from git's stdin.
  ZERO="0000000000000000000000000000000000000000"
  refs=0
  scanned=0
  TMP="$(mktemp)"
  while read -r _local_ref local_sha _; do
    refs=$((refs + 1))
    [[ "$local_sha" == "$ZERO" ]] && continue   # ref deletion: nothing to scan
    if git -C "$ROOT" show "$local_sha:sbom.cdx.json" >"$TMP" 2>/dev/null; then
      scan "$TMP"
      scanned=$((scanned + 1))
    else
      echo "pre-push: $_local_ref ($local_sha) has no sbom.cdx.json; skipping." >&2
    fi
  done
  # No refs on stdin (direct invocation, nothing piped): gate the working tree.
  if [[ "$refs" -eq 0 ]]; then
    scan "$ROOT/sbom.cdx.json"
  elif [[ "$scanned" -eq 0 ]]; then
    echo "pre-push: no pushed ref carried an sbom.cdx.json; nothing scanned." >&2
  fi
fi

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
