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
# `scan`). It adds one thing: it forces grype OFFLINE with
# GRYPE_DB_AUTO_UPDATE=false, so a push uses the cached DB and never waits on the
# network. grype fails a scan if its DB is missing or over five days old (ADR-
# 0022); the wrapper does NOT update it — that keeps the push fast and offline,
# and a missing/stale DB blocks the push as a tool error (per issue #143: always
# block). Refresh the DB out of band with `grype db update`.
#
#   scripts/pre-push-scan.sh              # scan /sbom.cdx.json (the hook)
#   scripts/pre-push-scan.sh <sbom-path>  # scan another SBOM   (the test uses this)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Offline + fast: use the cached grype DB, never hit the network on a push.
export GRYPE_DB_AUTO_UPDATE=false

# Forward to the shared gate. Its exit is the wrapper's exit, so a high/critical
# finding (grype 2 -> gate exit 1) blocks the push; "$@" lets the test point the
# gate at a fixture SBOM, and defaults to /sbom.cdx.json for the hook.
exec "$ROOT/scripts/grype-scan.sh" "$@"
