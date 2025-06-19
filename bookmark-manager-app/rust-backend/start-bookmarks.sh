#!/bin/bash

echo "Starting Bookmarks Service..."

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Current directory: $(pwd)"

# Source the environment file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Set default values if not provided
export BOOKMARKS_SERVER_HOST="${BOOKMARKS_SERVER_HOST:-0.0.0.0}"
export BOOKMARKS_SERVER_PORT="${BOOKMARKS_SERVER_PORT:-8002}"
export BOOKMARKS_DATABASE_URL="${BOOKMARKS_DATABASE_URL:-postgres://admin:admin@localhost:5434/bookmark_manager}"
export BOOKMARKS_JWT_SECRET="${BOOKMARKS_JWT_SECRET:-test-secret-key-change-in-production}"
export BOOKMARKS_REDIS_URL="${BOOKMARKS_REDIS_URL:-redis://localhost:6382}"

echo "Checking environment variables..."
echo "BOOKMARKS_SERVER_PORT=$BOOKMARKS_SERVER_PORT"
echo "BOOKMARKS_JWT_SECRET=$BOOKMARKS_JWT_SECRET"
echo "BOOKMARKS_DATABASE_URL=$BOOKMARKS_DATABASE_URL"
echo "BOOKMARKS_SERVER_HOST=$BOOKMARKS_SERVER_HOST"
echo "BOOKMARKS_REDIS_URL=$BOOKMARKS_REDIS_URL"

# Build and run
cargo run --bin bookmarks-service