#!/usr/bin/env bash
#
# Single grype pin for CI (ADR-0022, #225). ci.yml's grype-scan job and
# deps.yml's security gate both call this, so a grype upgrade changes this
# file only. It installs the pinned GitHub release to /usr/local/bin and
# verifies the tarball's sha256 BEFORE running it, rather than piping the
# mutable get.anchore.io/grype installer straight to `sh`. A compromised
# installer endpoint therefore cannot execute arbitrary code in the runner:
# the install fails unless the download matches the pinned checksum below.
#
# grype is PINNED so its behavior is reproducible; the DB it downloads is
# always current regardless of the pinned binary.
#
# CI-only: it pins linux_amd64 alone. Local runs use the developer's grype on
# PATH (scripts/grype-scan.sh, the pre-push hook).
#
#   scripts/grype-install.sh
#
# To bump: set GRYPE_VERSION, then copy the linux_amd64 .tar.gz line from the
# release's grype_<version>_checksums.txt into GRYPE_SHA256.
set -euo pipefail

GRYPE_VERSION="v0.120.1"
# sha256 of grype_<version>_linux_amd64.tar.gz. Bump with GRYPE_VERSION.
GRYPE_SHA256="0a9ee97ef5ae2ee953b0a80098105052e846cdbe319a57d808b519c33cd1343d"

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "grype-install.sh: pinned for linux_amd64 only (CI); got $(uname -s) $(uname -m)." >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

tarball="grype_${GRYPE_VERSION#v}_linux_amd64.tar.gz"
curl -sSfL "https://github.com/anchore/grype/releases/download/${GRYPE_VERSION}/${tarball}" -o "$tmp/$tarball"
echo "${GRYPE_SHA256}  $tmp/$tarball" | sha256sum -c -
tar -xzf "$tmp/$tarball" -C "$tmp" grype
sudo install -m 0755 "$tmp/grype" /usr/local/bin/grype
grype version
