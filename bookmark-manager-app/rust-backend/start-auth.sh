#!/bin/bash
export PATH="$HOME/.cargo/bin:$PATH"
cd /home/halcasteel/RUST-ACTIX-MIGRATION

# Source the .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Also export directly to ensure they're set
export BOOKMARKS_DATABASE_URL="postgres://admin:admin@localhost:5434/bookmark_manager"
export BOOKMARKS_REDIS_URL="redis://localhost:6382"
export BOOKMARKS_JWT_SECRET="test-secret-key-change-in-production"
export BOOKMARKS_SERVER_PORT="8001"
export RUST_LOG="auth_service=debug,actix_web=info"

echo "Starting Auth Service..."
echo "Current directory: $(pwd)"
echo "Checking environment variables..."
env | grep BOOKMARKS_ | head -5

cargo run --bin auth-service