#!/bin/bash
export PATH="$HOME/.cargo/bin:$PATH"
cd /home/halcasteel/RUST-ACTIX-MIGRATION

echo "Testing config with environment variables..."
export BOOKMARKS_DATABASE_URL="postgres://admin:admin@localhost:5434/bookmark_manager"
export BOOKMARKS_REDIS_URL="redis://localhost:6382"
export BOOKMARKS_JWT_SECRET="test-secret-key-change-in-production"
export BOOKMARKS_SERVER_PORT="8001"

env | grep BOOKMARKS

echo "Environment variables set. Starting service..."
cargo run --bin auth-service