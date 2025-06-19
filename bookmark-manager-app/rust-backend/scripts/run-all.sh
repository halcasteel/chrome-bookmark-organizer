#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the parent directory (RUST-ACTIX-MIGRATION)
PARENT_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
cd "$PARENT_DIR"

# Add cargo to PATH if not already there
if ! command -v cargo &> /dev/null && [ -x "$HOME/.cargo/bin/cargo" ]; then
    export PATH="$HOME/.cargo/bin:$PATH"
fi

# Create logs directory
mkdir -p logs

# Log file with timestamp
LOG_FILE="logs/unified-$(date +%Y%m%d-%H%M%S).log"

# Function to log with timestamp and service name
log() {
    local service=$1
    local color=$2
    local message=$3
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${color}[$timestamp] [$service]${NC} $message" | tee -a "$LOG_FILE"
}

# Function to check if service is running
check_service() {
    local port=$1
    nc -z localhost $port 2>/dev/null
    return $?
}

# Cleanup function
cleanup() {
    log "SYSTEM" "$RED" "Shutting down services..."
    
    # Kill all child processes
    pkill -P $$
    
    # Wait for processes to exit
    wait
    
    log "SYSTEM" "$RED" "All services stopped"
    exit 0
}

# Set trap for cleanup on exit
trap cleanup EXIT INT TERM

# Header
clear
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${PURPLE}    Rust + Actix Microservices Platform${NC}"
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

log "SYSTEM" "$CYAN" "Starting unified logging to: $LOG_FILE"

# Check prerequisites
log "SYSTEM" "$YELLOW" "Checking prerequisites..."

# Check if cargo is installed
if ! command -v cargo &> /dev/null; then
    log "SYSTEM" "$RED" "ERROR: Cargo not found. Please install Rust."
    exit 1
fi

# Check if PostgreSQL is running
if ! check_service 5434; then
    log "SYSTEM" "$RED" "ERROR: PostgreSQL not running on port 5434"
    log "SYSTEM" "$YELLOW" "Start it with: cd ~/BOOKMARKS/bookmark-manager-app && docker-compose up -d postgres"
    exit 1
fi

# Check if Redis is running
if ! check_service 6382; then
    log "SYSTEM" "$RED" "ERROR: Redis not running on port 6382"
    log "SYSTEM" "$YELLOW" "Start it with: cd ~/BOOKMARKS/bookmark-manager-app && docker-compose up -d redis"
    exit 1
fi

log "SYSTEM" "$GREEN" "Prerequisites check passed"

# Create shared environment file in parent directory
cat > "$PARENT_DIR/.env.shared" << EOF
RUST_LOG=info
RUST_BACKTRACE=1
BOOKMARKS_DATABASE_URL=postgres://postgres:postgres@localhost:5434/bookmarks
BOOKMARKS_REDIS_URL=redis://localhost:6382
BOOKMARKS_JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
BOOKMARKS_LOG_LEVEL=info
EOF

# Build all services first
log "BUILD" "$YELLOW" "Building all services..."
cargo build --release 2>&1 | while IFS= read -r line; do
    log "BUILD" "$YELLOW" "$line"
done

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    log "BUILD" "$RED" "Build failed!"
    exit 1
fi

log "BUILD" "$GREEN" "Build completed successfully"

# Function to run a service with logging
run_service() {
    local service_name=$1
    local service_path=$2
    local port=$3
    local color=$4
    local env_vars=$5
    
    log "$service_name" "$color" "Starting on port $port..."
    
    cd "$PARENT_DIR/$service_path" || exit 1
    
    # Copy shared env and add service-specific vars
    cp "$PARENT_DIR/.env.shared" .env
    echo "$env_vars" >> .env
    
    # Run migrations if it's a service with database
    if [ -d "migrations" ]; then
        log "$service_name" "$color" "Running database migrations..."
        sqlx migrate run 2>&1 | while IFS= read -r line; do
            log "$service_name" "$color" "$line"
        done
    fi
    
    # Start the service and pipe output to unified log
    RUST_LOG=info cargo run --release 2>&1 | while IFS= read -r line; do
        log "$service_name" "$color" "$line"
    done &
    
    local pid=$!
    
    # Wait for service to start
    local attempts=0
    while ! check_service $port && [ $attempts -lt 30 ]; do
        sleep 1
        attempts=$((attempts + 1))
    done
    
    if check_service $port; then
        log "$service_name" "$GREEN" "Started successfully (PID: $pid)"
    else
        log "$service_name" "$RED" "Failed to start!"
        return 1
    fi
    
    cd - > /dev/null
}

# Start services
log "SYSTEM" "$CYAN" "Starting microservices..."

# Auth Service
run_service "AUTH" "services/auth" 8001 "$BLUE" "
BOOKMARKS_SERVER_PORT=8001
BOOKMARKS_SERVER_HOST=0.0.0.0
"

# Bookmarks Service
run_service "BOOKS" "services/bookmarks" 8002 "$GREEN" "
BOOKMARKS_SERVER_PORT=8002
BOOKMARKS_SERVER_HOST=0.0.0.0
"

# Import Service
run_service "IMPORT" "services/import" 8003 "$YELLOW" "
BOOKMARKS_SERVER_PORT=8003
BOOKMARKS_SERVER_HOST=0.0.0.0
"

# Search Service
run_service "SEARCH" "services/search" 8004 "$PURPLE" "
BOOKMARKS_SERVER_PORT=8004
BOOKMARKS_SERVER_HOST=0.0.0.0
"

# Gateway (start last)
run_service "GATEWAY" "services/gateway" 8080 "$CYAN" "
GATEWAY_HOST=0.0.0.0
GATEWAY_PORT=8080
AUTH_SERVICE_URL=http://localhost:8001
BOOKMARKS_SERVICE_URL=http://localhost:8002
IMPORT_SERVICE_URL=http://localhost:8003
SEARCH_SERVICE_URL=http://localhost:8004
"

# Display status
echo ""
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}All services started successfully!${NC}"
echo ""
echo -e "${CYAN}Service URLs:${NC}"
echo -e "  Gateway:    ${GREEN}http://localhost:8080${NC}"
echo -e "  Auth:       ${GREEN}http://localhost:8001${NC}"
echo -e "  Bookmarks:  ${GREEN}http://localhost:8002${NC}"
echo -e "  Import:     ${GREEN}http://localhost:8003${NC}"
echo -e "  Search:     ${GREEN}http://localhost:8004${NC}"
echo ""
echo -e "${CYAN}Logs:${NC} $LOG_FILE"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"

# Health check endpoint
log "SYSTEM" "$CYAN" "Starting health monitoring..."
while true; do
    sleep 30
    
    # Check gateway health
    if curl -s http://localhost:8080/health > /dev/null 2>&1; then
        health_status=$(curl -s http://localhost:8080/health | jq -r '.status' 2>/dev/null || echo "unknown")
        log "HEALTH" "$GREEN" "Gateway status: $health_status"
    else
        log "HEALTH" "$RED" "Gateway health check failed!"
    fi
done &

# Wait for all background processes
wait