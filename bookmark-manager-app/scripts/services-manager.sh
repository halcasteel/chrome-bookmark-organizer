#!/bin/bash
# Unified Services Manager - Start, Stop, Status, Restart

set -e

# Add Rust to PATH (from .claude/CLAUDE.md)
export PATH="$HOME/.cargo/bin:$PATH"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Service definitions
RUST_SERVICES=("auth-service" "bookmarks-service" "import-service" "search-service" "aiops-monitor" "gateway")
RUST_PORTS=(8001 8002 8003 8004 8500 8000)
INFRA_SERVICES=("postgresql" "redis" "vector")
INFRA_PORTS=(5434 6382 8686)

# Function to display usage
usage() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                    Services Manager                             ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Usage: $0 {start|stop|restart|status|check|clean}"
    echo ""
    echo "Commands:"
    echo "  start   - Start all services"
    echo "  stop    - Stop all services gracefully"
    echo "  restart - Stop and start all services"
    echo "  status  - Show detailed status of all services"
    echo "  check   - Health check all services"
    echo "  clean   - Stop all and clean up logs/temp files"
    echo ""
    exit 1
}

# Function to check if a process is running
check_process() {
    if pgrep -f "$1" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to check if port is in use
check_port() {
    nc -z localhost $1 2>/dev/null
}

# Function to wait for a port to be available
wait_for_port() {
    local port=$1
    local service=$2
    local timeout=${3:-30}
    
    echo -e "${YELLOW}Waiting for $service on port $port...${NC}"
    for i in $(seq 1 $timeout); do
        if check_port $port; then
            echo -e "${GREEN}✓ $service is ready on port $port${NC}"
            return 0
        fi
        sleep 1
    done
    echo -e "${RED}✗ Timeout waiting for $service on port $port${NC}"
    return 1
}

# Function to get service PID
get_service_pid() {
    pgrep -f "$1" | head -1
}

# Function to stop a service gracefully
stop_service() {
    local service=$1
    local timeout=${2:-10}
    
    if check_process "$service"; then
        local pid=$(get_service_pid "$service")
        echo -e "${YELLOW}Stopping $service (PID: $pid)...${NC}"
        
        # Try graceful shutdown first
        kill -TERM $pid 2>/dev/null || true
        
        # Wait for process to stop
        for i in $(seq 1 $timeout); do
            if ! check_process "$service"; then
                echo -e "${GREEN}✓ $service stopped${NC}"
                return 0
            fi
            sleep 1
        done
        
        # Force kill if still running
        echo -e "${YELLOW}Force stopping $service...${NC}"
        kill -9 $pid 2>/dev/null || true
        sleep 1
        
        if ! check_process "$service"; then
            echo -e "${GREEN}✓ $service force stopped${NC}"
        else
            echo -e "${RED}✗ Failed to stop $service${NC}"
            return 1
        fi
    else
        echo -e "${CYAN}$service is not running${NC}"
    fi
}

# Start all services
start_services() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║        Starting Bookmark Manager Services                       ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Check for stale processes first
    echo -e "${YELLOW}Checking for stale processes...${NC}"
    for i in ${!RUST_SERVICES[@]}; do
        service=${RUST_SERVICES[$i]}
        port=${RUST_PORTS[$i]}
        
        if check_process "$service" && ! check_port $port; then
            echo -e "${YELLOW}Found stale $service process, cleaning up...${NC}"
            stop_service "$service"
        fi
    done
    
    # Start infrastructure
    echo -e "${GREEN}Step 1: Starting infrastructure...${NC}"
    # Check if containers are already running
    if docker ps | grep -q bookmark-postgres && docker ps | grep -q bookmark-redis; then
        echo -e "${YELLOW}Infrastructure containers are already running${NC}"
    else
        echo "Starting PostgreSQL and Redis containers..."
        docker-compose up -d postgres redis
        sleep 5  # Wait for services to be ready
    fi
    
    # Start logging system
    echo -e "${GREEN}Step 2: Starting logging system...${NC}"
    # Default to basic mode, can be overridden with LOGGING_MODE env var
    LOGGING_MODE=${LOGGING_MODE:-basic}
    ./scripts/start-logging.sh $LOGGING_MODE
    
    # Build Rust services
    echo -e "${GREEN}Step 3: Building Rust services...${NC}"
    cd rust-backend
    cargo build --release
    
    # Start Rust services
    echo -e "${GREEN}Step 4: Starting Rust backend services...${NC}"
    
    for i in ${!RUST_SERVICES[@]}; do
        service=${RUST_SERVICES[$i]}
        port=${RUST_PORTS[$i]}
        
        if ! check_process "$service"; then
            echo "Starting $service..."
            if [ "$service" = "gateway" ]; then
                GATEWAY_PORT=8000 ./target/release/$service &
            else
                ./target/release/$service &
            fi
            wait_for_port $port "$service"
        else
            echo -e "${YELLOW}$service is already running${NC}"
        fi
    done
    
    cd ..
    
    # Start frontend
    echo -e "${GREEN}Step 5: Starting frontend...${NC}"
    if ! check_process "vite"; then
        cd frontend
        npm run dev &
        cd ..
    else
        echo -e "${YELLOW}Frontend is already running${NC}"
    fi
    
    sleep 3
    show_status
}

# Stop all services
stop_services() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║        Stopping Bookmark Manager Services                       ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Stop frontend
    echo -e "${YELLOW}Stopping frontend...${NC}"
    stop_service "vite"
    
    # Stop Rust services in reverse order
    echo -e "${YELLOW}Stopping Rust services...${NC}"
    for ((i=${#RUST_SERVICES[@]}-1; i>=0; i--)); do
        stop_service "${RUST_SERVICES[$i]}"
    done
    
    # Stop Vector
    echo -e "${YELLOW}Stopping Vector...${NC}"
    stop_service "vector"
    
    # Stop infrastructure
    echo -e "${YELLOW}Stopping infrastructure containers...${NC}"
    docker stop bookmark-postgres bookmark-redis 2>/dev/null || true
    
    echo -e "${GREEN}All services stopped${NC}"
}

# Show detailed status
show_status() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                     Service Status                              ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Infrastructure status
    echo -e "${CYAN}Infrastructure:${NC}"
    for i in ${!INFRA_SERVICES[@]}; do
        service=${INFRA_SERVICES[$i]}
        port=${INFRA_PORTS[$i]}
        
        if [ "$service" = "postgresql" ] || [ "$service" = "redis" ]; then
            container_name="bookmark-$service"
            if docker ps | grep -q $container_name; then
                echo -e "  $service: ${GREEN}✓ Running${NC} (port $port)"
            else
                echo -e "  $service: ${RED}✗ Stopped${NC}"
            fi
        else
            if check_process "$service" && check_port $port; then
                pid=$(get_service_pid "$service")
                echo -e "  $service: ${GREEN}✓ Running${NC} (PID: $pid, port $port)"
            else
                echo -e "  $service: ${RED}✗ Stopped${NC}"
            fi
        fi
    done
    
    echo ""
    echo -e "${CYAN}Rust Services:${NC}"
    for i in ${!RUST_SERVICES[@]}; do
        service=${RUST_SERVICES[$i]}
        port=${RUST_PORTS[$i]}
        
        if check_process "$service" && check_port $port; then
            pid=$(get_service_pid "$service")
            echo -e "  $service: ${GREEN}✓ Running${NC} (PID: $pid, port $port)"
        elif check_process "$service"; then
            pid=$(get_service_pid "$service")
            echo -e "  $service: ${YELLOW}⚠ Process running but port not responding${NC} (PID: $pid)"
        else
            echo -e "  $service: ${RED}✗ Stopped${NC}"
        fi
    done
    
    echo ""
    echo -e "${CYAN}Frontend:${NC}"
    if check_process "vite"; then
        pid=$(get_service_pid "vite")
        echo -e "  Vite Dev Server: ${GREEN}✓ Running${NC} (PID: $pid, port 5173)"
    else
        echo -e "  Vite Dev Server: ${RED}✗ Stopped${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}URLs:${NC}"
    echo "  Frontend:       http://localhost:5173"
    echo "  API Gateway:    http://localhost:8000"
    echo "  AI-Ops Monitor: http://localhost:8500"
    echo "  Vector API:     http://localhost:8686"
    echo "  Vector Metrics: http://localhost:9598/metrics"
    
    echo ""
    echo -e "${CYAN}Logs:${NC}"
    echo "  Unified:        logs/unified.log"
    echo "  Structured:     logs/structured/*.json"
}

# Health check all services
check_health() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                    Health Check                                 ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Check each service's health endpoint
    echo -e "${CYAN}Service Health Checks:${NC}"
    
    # Auth service
    if curl -s http://localhost:8001/health > /dev/null 2>&1; then
        echo -e "  Auth Service:     ${GREEN}✓ Healthy${NC}"
    else
        echo -e "  Auth Service:     ${RED}✗ Unhealthy${NC}"
    fi
    
    # API Gateway
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        response=$(curl -s http://localhost:8000/health)
        echo -e "  API Gateway:      ${GREEN}✓ Healthy${NC}"
        echo "    $response" | jq -r '.services' 2>/dev/null || true
    else
        echo -e "  API Gateway:      ${RED}✗ Unhealthy${NC}"
    fi
    
    # AI-Ops Monitor
    if curl -s http://localhost:8500/health > /dev/null 2>&1; then
        echo -e "  AI-Ops Monitor:   ${GREEN}✓ Healthy${NC}"
    else
        echo -e "  AI-Ops Monitor:   ${RED}✗ Unhealthy${NC}"
    fi
    
    # Vector
    if curl -s http://localhost:8686/health > /dev/null 2>&1; then
        echo -e "  Vector:           ${GREEN}✓ Healthy${NC}"
    else
        echo -e "  Vector:           ${RED}✗ Unhealthy${NC}"
    fi
    
    # Database connection
    echo ""
    echo -e "${CYAN}Database Connection:${NC}"
    if PGPASSWORD=admin psql -h localhost -p 5434 -U admin -d bookmark_manager -c "SELECT 1" > /dev/null 2>&1; then
        echo -e "  PostgreSQL:       ${GREEN}✓ Connected${NC}"
    else
        echo -e "  PostgreSQL:       ${RED}✗ Connection failed${NC}"
    fi
    
    # Redis connection
    if redis-cli -p 6382 ping > /dev/null 2>&1; then
        echo -e "  Redis:            ${GREEN}✓ Connected${NC}"
    else
        echo -e "  Redis:            ${RED}✗ Connection failed${NC}"
    fi
}

# Clean up everything
clean_all() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                    Cleaning Everything                          ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Stop all services
    stop_services
    
    # Clean logs
    echo -e "${YELLOW}Cleaning logs...${NC}"
    rm -f logs/*.log logs/structured/*.json
    touch logs/unified.log
    
    # Clean temp files
    echo -e "${YELLOW}Cleaning temp files...${NC}"
    rm -f /tmp/rust-services.log
    rm -rf rust-backend/target/debug/incremental
    
    # Clean Docker volumes (optional)
    read -p "Clean Docker volumes? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker volume rm bookmark-postgres-data bookmark-redis-data 2>/dev/null || true
        echo -e "${GREEN}Docker volumes cleaned${NC}"
    fi
    
    echo -e "${GREEN}Cleanup complete${NC}"
}

# Main command handler
case "$1" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        stop_services
        echo ""
        sleep 2
        start_services
        ;;
    status)
        show_status
        ;;
    check)
        check_health
        ;;
    clean)
        clean_all
        ;;
    *)
        usage
        ;;
esac