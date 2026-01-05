#!/bin/bash

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

# Start your server in the background
echo "Starting server..."
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
echo "You must run this script with 'npm run test:e2e'!"

# Run Playwright tests
bunx playwright test "$@"

# Store test exit code
TEST_EXIT=$?

# Cleanup happens automatically via trap
exit $TEST_EXIT
