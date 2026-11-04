#!/usr/bin/env bash
#
# The dev and e2e HTTPS edge (ADR-0034, #233). One Caddy serves
# https://localhost:3443 and routes by path to the two plain-HTTP servers (see
# /Caddyfile), so the browser sees one origin, as in production.
#
#   scripts/caddy.sh run     # run the edge in the foreground       (cgs caddy)
#   scripts/caddy.sh trust   # add Caddy's local CA to the system    (cgs caddy:trust)
#                            # trust stores; the edge must be running
#
# Caddy keeps its local CA in /.caddy/ (git-ignored), not in the user's home
# folder. It never changes the system trust store unless you run `trust`. The
# e2e tests do not need trust: Playwright sets `ignoreHTTPSErrors`, and the curl
# probes pass `--cacert "$CADDY_ROOT_CERT"`.
#
# Caddy pin — why this script fetches its own Caddy:
# This mirrors the syft pin in scripts/sbom.sh. The script downloads the release
# below into /.tools/, verifies the tarball BEFORE it runs Caddy, and ignores any
# PATH caddy. CI runs this script too. Caddy publishes SHA-512 checksums, so the
# pin is SHA-512. To bump: set CADDY_VERSION and copy the four SHA-512 values from
# the release's caddy_<version>_checksums.txt.
set -euo pipefail

# Resolve repo root from this script's location so it runs from any cwd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CADDY_VERSION="2.11.7"

# The Caddyfile reads CADDY_STORAGE; test-e2e.sh and CI read the root cert path.
export CADDY_STORAGE="$ROOT/.caddy"
CADDY_ROOT_CERT="$CADDY_STORAGE/pki/authorities/local/root.crt"

# Printed on any Caddy install failure: how to move the pin to another release.
caddy_help() {
  cat >&2 <<EOF

caddy.sh: could not install the pinned Caddy $CADDY_VERSION.
To update the Caddy pin, edit scripts/caddy.sh:
  1. Set CADDY_VERSION to the new release (e.g. 2.12.0, no leading "v").
  2. Replace the four SHA-512 values in caddy_sha512() with the matching lines of
     https://github.com/caddyserver/caddy/releases/download/v<version>/caddy_<version>_checksums.txt
     (mac_amd64, mac_arm64, linux_amd64, linux_arm64 .tar.gz).
EOF
}

# SHA-512 of caddy_<CADDY_VERSION>_<platform>.tar.gz. Bump with CADDY_VERSION.
caddy_sha512() {
  case "$1" in
    mac_amd64)   echo 147886811fa2320a8881c6116dc8cc3f0562e2f686509ccc60f55cf85dfd5ea78e9f5f770c75da13bf124a2536b72e887b975fefd58706de3dafb57483610e70 ;;
    mac_arm64)   echo 68f592df8f0ec058fbdb9b137b64e9a0aa792d28c06e1e3b9ec12d0e7fb371683a54e73ef6d8e6d0dd70dc6b941a5b5d5b73faedd3f89de119ad2eb78bdc668e ;;
    linux_amd64) echo a7a433a1b133efc3c8d10eb0b99d52a24b5ef5c322dc77f5282182b1c0402139ab83f3a99f0c52409df77d20123fb0b523edad8a66d8f5e49136197bf61ef0e7 ;;
    linux_arm64) echo 3db36ba90c7a6e8dda40ee3dd71fa08844c76b5fb08f61b31e5e78d2ed38e71c51dc7baed875e50d1ca1279196e84302967237386ae87c91ae9f2aaceada682e ;;
    *) echo "caddy.sh: no pinned Caddy checksum for platform '$1'." >&2; return 1 ;;
  esac
}

# Set CADDY to the pinned Caddy's path, downloading + verifying it on first use.
# Call it directly, not inside $(...): bash clears `set -e` in command
# substitutions, so a failed checksum there would not stop the script.
ensure_caddy() {
  local bin="$ROOT/.tools/caddy-$CADDY_VERSION/caddy"
  if [[ ! -x "$bin" ]]; then
    local os arch platform sha tarball tmp
    case "$(uname -s)" in
      Darwin) os=mac ;;
      Linux) os=linux ;;
      *) os="$(uname -s)" ;;
    esac
    case "$(uname -m)" in
      x86_64 | amd64) arch=amd64 ;;
      arm64 | aarch64) arch=arm64 ;;
      *) arch="$(uname -m)" ;;
    esac
    platform="${os}_${arch}"
    sha="$(caddy_sha512 "$platform")" || { caddy_help; return 1; }
    tarball="caddy_${CADDY_VERSION}_${platform}.tar.gz"
    local sha_cmd=(shasum -a 512)
    command -v sha512sum >/dev/null && sha_cmd=(sha512sum)
    tmp="$(mktemp -d)"
    echo "Installing pinned Caddy $CADDY_VERSION ($platform) into .tools/ ..." >&2
    # One subshell, one exit path: its EXIT trap cleans up on success or any
    # failed step, and the `||` below prints the pin help once. The binary is
    # staged beside $bin, then renamed into place (atomic on one filesystem),
    # so a concurrent run never executes a half-written file.
    (
      trap 'rm -rf "$tmp" "$bin.$$"' EXIT
      curl -sSfL "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/${tarball}" -o "$tmp/$tarball" &&
        echo "$sha  $tmp/$tarball" | "${sha_cmd[@]}" -c - >&2 &&
        tar -xzf "$tmp/$tarball" -C "$tmp" caddy &&
        mkdir -p "$(dirname "$bin")" &&
        install -m 0755 "$tmp/caddy" "$bin.$$" &&
        mv -f "$bin.$$" "$bin"
    ) || { caddy_help; return 1; }
  fi
  # Guard against a swapped or corrupt cached binary. `caddy version` prints
  # "v<version> h1:<hash>".
  local got
  got="$("$bin" version | cut -d' ' -f1)" || got="(version check failed)"
  if [[ "$got" != "v$CADDY_VERSION" ]]; then
    echo "caddy.sh: $bin reports Caddy $got, expected v$CADDY_VERSION. Delete .tools/ and retry." >&2
    caddy_help
    return 1
  fi
  CADDY="$bin"
}

case "${1:-}" in
  run)
    ensure_caddy
    exec "$CADDY" run --config "$ROOT/Caddyfile" --adapter caddyfile
    ;;
  trust)
    ensure_caddy
    # `caddy trust` reads the root certificate from the running edge's admin API.
    exec "$CADDY" trust --config "$ROOT/Caddyfile" --adapter caddyfile
    ;;
  *)
    echo "usage: scripts/caddy.sh {run|trust}" >&2
    exit 2
    ;;
esac
