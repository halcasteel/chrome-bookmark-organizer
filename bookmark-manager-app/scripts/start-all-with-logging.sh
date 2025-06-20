#!/bin/bash
# Start all services with unified logging and AI-Ops monitoring

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Bookmark Manager with AI-Ops Core & Unified Logging     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check if a process is running
check_process() {
    if pgrep -f "$1" > /dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to wait for a port to be available
wait_for_port() {
    local port=$1
    local service=$2
    local timeout=${3:-30}
    
    echo -e "${YELLOW}Waiting for $service on port $port...${NC}"
    for i in $(seq 1 $timeout); do
        if nc -z localhost $port 2>/dev/null; then
            echo -e "${GREEN}✓ $service is ready on port $port${NC}"
            return 0
        fi
        sleep 1
    done
    echo -e "${RED}✗ Timeout waiting for $service on port $port${NC}"
    return 1
}

# 1. Start infrastructure (PostgreSQL & Redis)
echo -e "${GREEN}Step 1: Starting infrastructure...${NC}"
node start-services.js

# 2. Start Vector for logging
echo -e "${GREEN}Step 2: Starting Vector for unified logging...${NC}"
if ! check_process "vector"; then
    ./scripts/start-vector.sh
    sleep 3
else
    echo -e "${YELLOW}Vector is already running${NC}"
fi

# 3. Build Rust services
echo -e "${GREEN}Step 3: Building Rust services...${NC}"
cd rust-backend
cargo build --release

# 4. Start Rust services
echo -e "${GREEN}Step 4: Starting Rust backend services...${NC}"

# Auth service
if ! check_process "auth-service"; then
    echo "Starting auth service..."
    ./target/release/auth-service &
    wait_for_port 8001 "Auth Service"
fi

# Bookmarks service
if ! check_process "bookmarks-service"; then
    echo "Starting bookmarks service..."
    ./target/release/bookmarks-service &
    wait_for_port 8002 "Bookmarks Service"
fi

# Import service
if ! check_process "import-service"; then
    echo "Starting import service..."
    ./target/release/import-service &
    wait_for_port 8003 "Import Service"
fi

# Search service
if ! check_process "search-service"; then
    echo "Starting search service..."
    ./target/release/search-service &
    wait_for_port 8004 "Search Service"
fi

# AI-Ops Monitor
if ! check_process "aiops-monitor"; then
    echo "Starting AI-Ops monitor..."
    ./target/release/aiops-monitor &
    wait_for_port 8500 "AI-Ops Monitor"
fi

# Gateway (must be last)
if ! check_process "gateway"; then
    echo "Starting API gateway..."
    GATEWAY_PORT=8000 ./target/release/gateway &
    wait_for_port 8000 "API Gateway"
fi

cd ..

# 5. Start frontend
echo -e "${GREEN}Step 5: Starting frontend...${NC}"
cd frontend
npm run dev &
cd ..

# Wait a bit for everything to stabilize
sleep 5

# 6. Show status
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                        Service Status                           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}Infrastructure:${NC}"
echo "  PostgreSQL:     localhost:5434"
echo "  Redis:          localhost:6382"
echo ""

echo -e "${GREEN}Rust Services:${NC}"
echo "  Auth Service:   http://localhost:8001"
echo "  Bookmarks:      http://localhost:8002"
echo "  Import:         http://localhost:8003"
echo "  Search:         http://localhost:8004"
echo "  API Gateway:    http://localhost:8000"
echo ""

echo -e "${GREEN}AI-Ops & Logging:${NC}"
echo "  AI-Ops Monitor: http://localhost:8500"
echo "  Vector API:     http://localhost:8686"
echo "  Vector Metrics: http://localhost:9598/metrics"
echo ""

echo -e "${GREEN}Frontend:${NC}"
echo "  React App:      http://localhost:5173"
echo ""

echo -e "${GREEN}Log Files:${NC}"
echo "  Unified Log:    logs/unified.log"
echo "  Structured:     logs/structured/*.json"
echo ""

echo -e "${YELLOW}Commands:${NC}"
echo "  View logs:      tail -f logs/unified.log"
echo "  View errors:    tail -f logs/structured/errors.json | jq"
echo "  AI-Ops status:  curl http://localhost:8500/status | jq"
echo "  Stop all:       pkill -f 'auth-service|bookmarks-service|import-service|search-service|gateway|aiops-monitor|vector'"
echo ""

echo -e "${GREEN}All services started successfully! 🚀${NC}"