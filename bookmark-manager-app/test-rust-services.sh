#!/bin/bash

# Test script to check if Rust services can be built and started

set -e

echo "Setting up environment..."
export PATH="$HOME/.cargo/bin:$PATH"
export DATABASE_URL="postgresql://admin:admin@localhost:5434/bookmark_manager"
export BOOKMARKS_DATABASE_URL="postgresql://admin:admin@localhost:5434/bookmark_manager"
export REDIS_URL="redis://localhost:6382"

echo "Checking Docker services..."
docker ps | grep -E "postgres|redis" || echo "Warning: Database services not running"

echo "Building Rust services..."
cd rust-backend

# Try to build just the main services first
echo "Building auth service..."
cargo build -p auth-service 2>&1 | tail -20

echo "Building bookmarks service..."
cargo build -p bookmarks-service 2>&1 | tail -20

echo "Building import service..."
cargo build -p import-service 2>&1 | tail -20

echo "Building gateway service..."
cargo build -p gateway-service 2>&1 | tail -20

echo "Build complete!"