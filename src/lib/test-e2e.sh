#!/bin/bash

# End-to-End test helper script
# Confirm Back-End server is running
# Start and confirm Front-End server is running
# Run Playwright tests
# Stop Front-End server

# Exit on error
set -e

# Trap to ensure server cleanup on exit
cleanup() {
  if [ ! -z "$SERVER_PID" ]; then
    echo "Stopping server (PID: $SERVER_PID)..."
    kill $SERVER_PID 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Confirm RPC endpoint returns `401` with `NO_AUTH` error (unauthenticated):
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:8080/api/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"test","params":{}}')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n1)

if [ "$HTTP_CODE" != "401" ]; then
  echo "FAIL: Expected HTTP 401, got $HTTP_CODE"
  echo "Body: $BODY"
  exit 1
fi
if ! echo "$BODY" | grep -q "NO_AUTH"; then
  echo "FAIL: Expected body to contain 'NO_AUTH'"
  echo "Body: $BODY"
  exit 1
fi
echo "Back-End server OK: RPC unauthenticated request returned HTTP 401 with NO_AUTH"
echo

# Start Front-End server in the background
echo "Starting Front-End server..."
bun run dev &  # or whatever your dev server command is
SERVER_PID=$!

# Wait for server to be ready (with timeout)
echo "Waiting for server to be ready..."
MAX_ATTEMPTS=60  # 30 seconds (60 * 0.5s)
ATTEMPT=0

while ! curl -s http://localhost:3000 > /dev/null; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
    echo "Server failed to start within 30 seconds"
    exit 1
  fi
  sleep 0.5
done

echo "Server ready, running tests..."
echo
echo "You must run this script with 'npm run test:e2e'!"

# Run Playwright tests
bunx playwright test "$@"

# Store test exit code
TEST_EXIT=$?

# Cleanup happens automatically via trap
exit $TEST_EXIT
