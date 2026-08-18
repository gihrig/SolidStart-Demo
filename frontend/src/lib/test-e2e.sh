#!/bin/bash

# End-to-End test helper script
# Starts the Back-End server (release) and the Front-End server, runs Playwright,
# then stops both. Assumes Postgres is running (see `cgs db`); a cold release
# compile can be slow, so run `cgs release` first if the back-end times out below.

# Exit on error
set -e

BE_PID=""       # launcher subshell (cgs/cargo), set only if we start the back-end
BE_STARTED=""   # "1" only if THIS script started the back-end (so we own teardown)
FE_PID=""

# Trap to ensure the servers this script started are cleaned up on exit.
cleanup() {
  if [ -n "$FE_PID" ]; then
    echo "Stopping Front-End (PID: $FE_PID)..."
    kill "$FE_PID" 2>/dev/null || true
  fi
  if [ "$BE_STARTED" = "1" ]; then
    echo "Stopping Back-End..."
    # `cgs start` runs `cargo run`, which spawns the web-server as a grandchild;
    # killing the launcher alone leaks it, so also kill whatever holds :8080.
    [ -n "$BE_PID" ] && kill "$BE_PID" 2>/dev/null || true
    local be_listener
    be_listener=$(lsof -ti tcp:8080 -sTCP:LISTEN 2>/dev/null || true)
    [ -n "$be_listener" ] && kill $be_listener 2>/dev/null || true
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

# Reuse an already-running back-end if one is up; otherwise start our own.
# When we start it, it's quiet by default (the back-end logs at debug via
# .cargo/config.toml, which is noisy under Playwright). Override the level per
# run, e.g. `E2E_RUST_LOG=debug vpr test:e2e`. A back-end we did NOT start keeps
# its own log level — stop it first if you want E2E_RUST_LOG to take effect.
if be_ready; then
  echo "Back-End already running on :8080 — reusing it."
  echo "  (Its log level is that process's own, not E2E_RUST_LOG=${E2E_RUST_LOG:-warn}.)"
else
  # The web-server logs to stdout (kept visible); cargo/cgs build output and the
  # SIGTERM "failure" it prints when we stop it go to stderr -> a log file, so
  # they don't clutter the e2e run. Inspect the file if the back-end misbehaves.
  BE_ERR_LOG="reports/e2e-backend.stderr.log"
  mkdir -p reports
  echo "Starting Back-End server (release, RUST_LOG=${E2E_RUST_LOG:-warn}; build log -> $BE_ERR_LOG)..."
  (cd ../backend && RUST_LOG="${E2E_RUST_LOG:-warn}" cgs start) 2>"$BE_ERR_LOG" &
  BE_PID=$!
  BE_STARTED=1

  # Wait for the Back-End to be ready (with timeout)
  echo "Waiting for Back-End server to be ready..."
  BE_MAX_ATTEMPTS=240  # 120 seconds (240 * 0.5s) — allows for a release compile
  BE_ATTEMPT=0
  until be_ready; do
    BE_ATTEMPT=$((BE_ATTEMPT + 1))
    if [ $BE_ATTEMPT -ge $BE_MAX_ATTEMPTS ]; then
      echo "Back-End server failed to start within 120 seconds. Last stderr:"
      tail -n 20 "$BE_ERR_LOG" 2>/dev/null || true
      exit 1
    fi
    sleep 0.5
  done
  echo "Back-End server OK: RPC unauthenticated request returned HTTP 401 with NO_AUTH"
fi
echo

# Create project release build
echo "Creating project release build..."
vinxi build

# Start Front-End server in the background
echo "Starting Front-End server..."
vinxi start &
FE_PID=$!

# Wait for the Front-End to be ready (with timeout)
echo "Waiting for Front-End server to be ready..."
MAX_ATTEMPTS=60  # 30 seconds (60 * 0.5s)
ATTEMPT=0
while ! curl -s http://localhost:3000 > /dev/null; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
    echo "Front-End server failed to start within 30 seconds"
    exit 1
  fi
  sleep 0.5
done

echo
echo "Servers ready, running tests..."
echo
echo "Command: vpx playwright test $@"

# Run Playwright tests
vpx playwright test "$@"

# Store test exit code
TEST_EXIT=$?

# Cleanup happens automatically via trap
exit $TEST_EXIT
