#!/bin/bash

# Lighthouse report helper script
# Starts the Back-End server (release), the Front-End server and the HTTPS edge
# (Caddy, ADR-0034), waits until the edge serves the page and routes /api, runs
# Lighthouse against https://localhost:3443, then stops all three. Assumes
# Postgres is running (see `cgs db`). The back-end start rebuilds the DB from
# the seed, so the report shows the seeded Jedi feed.

# Exit on error
set -e

BE_PID=""       # launcher subshell (cgs/cargo), set only if we start the back-end
BE_STARTED=""   # "1" only if THIS script started the back-end (so we own teardown)
FE_PID=""
EDGE_PID=""
# The edge's local CA (scripts/caddy.sh); the probes verify TLS against it.
EDGE_CA="../.caddy/pki/authorities/local/root.crt"
REPORT="reports/lighthouse/lighthouse-report.html"

# True if $1 is $BE_PID or one of its descendants. Walks the parent chain with
# `ps`, so it must be called while the launcher is still alive (see test-e2e.sh).
owned_by_launcher() {
  local pid=$1 hops=0
  [ -n "$BE_PID" ] || return 1
  while [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null; do
    [ "$pid" = "$BE_PID" ] && return 0
    pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d '[:space:]')
    hops=$((hops + 1))
    [ $hops -ge 20 ] && break
  done
  return 1
}

# Trap to ensure the servers this script started are cleaned up on exit.
cleanup() {
  if [ -n "$EDGE_PID" ]; then
    echo "Stopping HTTPS edge (PID: $EDGE_PID)..."
    kill "$EDGE_PID" 2>/dev/null || true
  fi
  if [ -n "$FE_PID" ]; then
    echo "Stopping Front-End (PID: $FE_PID)..."
    kill "$FE_PID" 2>/dev/null || true
  fi
  if [ "$BE_STARTED" = "1" ]; then
    echo "Stopping Back-End..."
    # `cgs start` runs the web-server as a grandchild; kill our :8080 listener
    # too, but only if it is ours (resolved before the launcher dies).
    local pid our_listeners=""
    for pid in $(lsof -ti tcp:8080 -sTCP:LISTEN 2>/dev/null || true); do
      if owned_by_launcher "$pid"; then
        our_listeners="$our_listeners $pid"
      else
        echo "  Leaving PID $pid on :8080 alone (not started by this script)."
      fi
    done
    [ -n "$BE_PID" ] && kill "$BE_PID" 2>/dev/null || true
    [ -n "$our_listeners" ] && kill $our_listeners 2>/dev/null || true
    # Reap the launcher so its SIGTERM exit status is not surfaced as an error.
    [ -n "$BE_PID" ] && wait "$BE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Readiness probe: the RPC endpoint returns HTTP 401 with a NO_AUTH error body
# for an unauthenticated request once the back-end is up.
be_ready() {
  local resp code body
  resp=$(curl -s -w "\n%{http_code}" -X POST http://localhost:8080/api/rpc \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"test","params":{}}') || return 1
  code=$(echo "$resp" | tail -n1)
  body=$(echo "$resp" | head -n1)
  [ "$code" = "401" ] && echo "$body" | grep -q "NO_AUTH"
}

# Refuse a listener on any port we must bind (for example a running `cgs dev`).
# None is ours, so the cleanup trap leaves it running.
for port in 8080 3000 3443; do
  if [ -n "$(lsof -ti tcp:$port -sTCP:LISTEN 2>/dev/null || true)" ]; then
    echo "Error: a server is already listening on :$port. Stop it, then run Lighthouse again." >&2
    exit 1
  fi
done

BE_ERR_LOG="reports/lighthouse-backend.stderr.log"
mkdir -p reports/lighthouse
echo "Starting Back-End server (release, RUST_LOG=warn; build log -> $BE_ERR_LOG)..."
(cd ../backend && RUST_LOG=warn cgs start) >/dev/null 2>"$BE_ERR_LOG" &
BE_PID=$!
BE_STARTED=1

echo "Waiting for Back-End server to be ready..."
BE_ATTEMPT=0
until be_ready; do
  BE_ATTEMPT=$((BE_ATTEMPT + 1))
  if [ $BE_ATTEMPT -ge 240 ]; then  # 120 seconds — allows for a release compile
    echo "Back-End server failed to start within 120 seconds. Last stderr:"
    tail -n 20 "$BE_ERR_LOG" 2>/dev/null || true
    exit 1
  fi
  sleep 0.5
done
echo "Back-End server OK"

echo "Creating project release build..."
vinxi build

echo "Starting Front-End server..."
vinxi start &
FE_PID=$!

EDGE_ERR_LOG="reports/lighthouse-edge.stderr.log"
echo "Starting HTTPS edge (log -> $EDGE_ERR_LOG)..."
../scripts/caddy.sh run 2>"$EDGE_ERR_LOG" &
EDGE_PID=$!

# Wait for the edge: the page and the back-end, over verified TLS (with timeout).
edge_ready() {
  [ -f "$EDGE_CA" ] || return 1
  curl -sf --cacert "$EDGE_CA" https://localhost:3443/ > /dev/null || return 1
  curl -s --cacert "$EDGE_CA" -X POST https://localhost:3443/api/rpc \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"test","params":{}}' | grep -q "NO_AUTH"
}
echo "Waiting for the Front-End and the HTTPS edge to be ready..."
ATTEMPT=0
until edge_ready; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ $ATTEMPT -ge 60 ]; then
    echo "HTTPS edge failed to start within 30 seconds. Last stderr:"
    tail -n 20 "$EDGE_ERR_LOG" 2>/dev/null || true
    exit 1
  fi
  sleep 0.5
done
echo "HTTPS edge OK: https://localhost:3443 serves the page and routes /api to the back-end"

echo "Running Lighthouse (report -> $REPORT)..."
set +e
CHROME_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
  lighthouse https://localhost:3443 --chrome-flags=--ignore-certificate-errors \
  --output html --output-path "./$REPORT" --view
LH_EXIT=$?

# Cleanup happens automatically via trap
exit $LH_EXIT
