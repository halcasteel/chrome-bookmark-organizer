#!/bin/bash

# Service Manager for Rust Microservices

# Get the parent directory (RUST-ACTIX-MIGRATION)
PARENT_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
cd "$PARENT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Services configuration
declare -A SERVICES=(
    ["auth"]="8001"
    ["bookmarks"]="8002"
    ["import"]="8003"
    ["search"]="8004"
    ["gateway"]="8080"
)

# Function to check if service is running
is_running() {
    local port=$1
    nc -z localhost $port 2>/dev/null
    return $?
}

# Function to get service status
get_status() {
    local service=$1
    local port=${SERVICES[$service]}
    
    if is_running $port; then
        echo -e "${GREEN}● Running${NC}"
    else
        echo -e "${RED}● Stopped${NC}"
    fi
}

# Function to start a service
start_service() {
    local service=$1
    local port=${SERVICES[$service]}
    
    if is_running $port; then
        echo -e "${YELLOW}Service $service is already running${NC}"
        return
    fi
    
    echo -e "${CYAN}Starting $service service...${NC}"
    
    cd "services/$service" 2>/dev/null || {
        echo -e "${RED}Service directory not found${NC}"
        return 1
    }
    
    nohup cargo run --release > "../../logs/${service}.log" 2>&1 &
    
    # Wait for service to start
    local attempts=0
    while ! is_running $port && [ $attempts -lt 10 ]; do
        sleep 1
        attempts=$((attempts + 1))
    done
    
    if is_running $port; then
        echo -e "${GREEN}Service $service started on port $port${NC}"
    else
        echo -e "${RED}Failed to start $service${NC}"
    fi
    
    cd - > /dev/null
}

# Function to stop a service
stop_service() {
    local service=$1
    local port=${SERVICES[$service]}
    
    echo -e "${CYAN}Stopping $service service...${NC}"
    
    # Find and kill process using the port
    local pid=$(lsof -ti:$port)
    if [ ! -z "$pid" ]; then
        kill $pid
        echo -e "${GREEN}Service $service stopped${NC}"
    else
        echo -e "${YELLOW}Service $service is not running${NC}"
    fi
}

# Function to restart a service
restart_service() {
    local service=$1
    stop_service $service
    sleep 2
    start_service $service
}

# Function to show all services status
show_status() {
    echo -e "${PURPLE}═══════════════════════════════════════════${NC}"
    echo -e "${PURPLE}    Microservices Status${NC}"
    echo -e "${PURPLE}═══════════════════════════════════════════${NC}"
    echo ""
    
    for service in "${!SERVICES[@]}"; do
        printf "%-12s %-6s %s\n" "$service" "(${SERVICES[$service]})" "$(get_status $service)"
    done
    
    echo ""
}

# Function to tail logs
tail_logs() {
    local service=$1
    local log_file="logs/${service}.log"
    
    if [ -f "$log_file" ]; then
        echo -e "${CYAN}Tailing logs for $service...${NC}"
        echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
        tail -f "$log_file"
    else
        echo -e "${RED}No log file found for $service${NC}"
    fi
}

# Main menu
case "$1" in
    start)
        if [ -z "$2" ]; then
            echo "Starting all services..."
            for service in gateway auth bookmarks import search; do
                start_service $service
            done
        else
            start_service $2
        fi
        ;;
    
    stop)
        if [ -z "$2" ]; then
            echo "Stopping all services..."
            for service in gateway auth bookmarks import search; do
                stop_service $service
            done
        else
            stop_service $2
        fi
        ;;
    
    restart)
        if [ -z "$2" ]; then
            echo "Restarting all services..."
            for service in gateway auth bookmarks import search; do
                restart_service $service
            done
        else
            restart_service $2
        fi
        ;;
    
    status)
        show_status
        ;;
    
    logs)
        if [ -z "$2" ]; then
            echo -e "${RED}Please specify a service${NC}"
            echo "Usage: $0 logs <service>"
        else
            tail_logs $2
        fi
        ;;
    
    health)
        echo -e "${CYAN}Checking health endpoints...${NC}"
        echo ""
        
        # Check gateway health which includes all services
        if is_running 8080; then
            curl -s http://localhost:8080/health | jq '.' || echo "Failed to get health status"
        else
            echo -e "${RED}Gateway is not running${NC}"
        fi
        ;;
    
    *)
        echo -e "${PURPLE}Rust Microservices Manager${NC}"
        echo ""
        echo "Usage: $0 {start|stop|restart|status|logs|health} [service]"
        echo ""
        echo "Commands:"
        echo "  start [service]    Start service(s)"
        echo "  stop [service]     Stop service(s)"
        echo "  restart [service]  Restart service(s)"
        echo "  status             Show all services status"
        echo "  logs <service>     Tail service logs"
        echo "  health             Check health endpoints"
        echo ""
        echo "Services: auth, bookmarks, import, search, gateway"
        echo ""
        echo "Examples:"
        echo "  $0 start           # Start all services"
        echo "  $0 start auth      # Start only auth service"
        echo "  $0 logs gateway    # View gateway logs"
        echo "  $0 status          # Show all services status"
        ;;
esac