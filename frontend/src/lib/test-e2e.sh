#!/bin/bash

# End-to-End test helper script
# Starts the Back-End server (release) and the Front-End server, runs Playwright,
# then stops both. Assumes Postgres is running (see `cgs db`); a cold release
# compile can be slow, so run `cgs release` first if the back-end times out below.

# Exit on error
set -e

BE_PID=""
FE_PID=""

# Trap to ensure both servers are cleaned up on exit
cleanup() {
  if [ -n "$FE_PID" ]; then
    echo "Stopping Front-End (PID: $FE_PID)..."
    kill $FE_PID 2>/dev/null || true
  fi
  if [ -n "$BE_PID" ]; then
    echo "Stopping Back-End (PID: $BE_PID)..."
    kill $BE_PID 2>/dev/null || true
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

# Start the Back-End server (release) in the background
echo "Starting Back-End server (release)..."
(cd ../backend && cgs start) &
BE_PID=$!

# Wait for the Back-End to be ready (with timeout)
echo "Waiting for Back-End server to be ready..."
BE_MAX_ATTEMPTS=240  # 120 seconds (240 * 0.5s) — allows for a release compile
BE_ATTEMPT=0
until be_ready; do
  BE_ATTEMPT=$((BE_ATTEMPT + 1))
  if [ $BE_ATTEMPT -ge $BE_MAX_ATTEMPTS ]; then
    echo "Back-End server failed to start within 120 seconds"
    exit 1
  fi
  sleep 0.5
done
echo "Back-End server OK: RPC unauthenticated request returned HTTP 401 with NO_AUTH"
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
