#!/bin/bash

# Get the parent directory
PARENT_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Starting Dependencies (PostgreSQL & Redis)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"

# Navigate to bookmark-manager-app
BOOKMARK_APP_DIR="$HOME/BOOKMARKS/bookmark-manager-app"

if [ ! -d "$BOOKMARK_APP_DIR" ]; then
    echo -e "${RED}Error: bookmark-manager-app directory not found at $BOOKMARK_APP_DIR${NC}"
    exit 1
fi

cd "$BOOKMARK_APP_DIR"

# Check if docker-compose file exists
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}Error: docker-compose.yml not found${NC}"
    exit 1
fi

# Function to check if service is running
check_service() {
    local service=$1
    local port=$2
    nc -z localhost $port 2>/dev/null
    return $?
}

# Check current status
echo -e "${YELLOW}Checking current status...${NC}"

pg_running=false
redis_running=false

if check_service "PostgreSQL" 5434; then
    echo -e "${GREEN}✓ PostgreSQL is already running on port 5434${NC}"
    pg_running=true
else
    echo -e "${YELLOW}✗ PostgreSQL is not running${NC}"
fi

if check_service "Redis" 6382; then
    echo -e "${GREEN}✓ Redis is already running on port 6382${NC}"
    redis_running=true
else
    echo -e "${YELLOW}✗ Redis is not running${NC}"
fi

# Start services if needed
if [ "$pg_running" = true ] && [ "$redis_running" = true ]; then
    echo -e "${GREEN}All dependencies are already running!${NC}"
    exit 0
fi

# Start services
echo ""
echo -e "${CYAN}Starting services...${NC}"
docker-compose up -d postgres redis

# Wait for PostgreSQL
if [ "$pg_running" = false ]; then
    echo -ne "${YELLOW}Waiting for PostgreSQL to be ready${NC}"
    attempts=0
    while ! check_service "PostgreSQL" 5434 && [ $attempts -lt 30 ]; do
        sleep 1
        attempts=$((attempts + 1))
        echo -n "."
    done
    echo ""
    
    if check_service "PostgreSQL" 5434; then
        echo -e "${GREEN}✓ PostgreSQL started successfully${NC}"
    else
        echo -e "${RED}✗ PostgreSQL failed to start${NC}"
        docker-compose logs postgres | tail -10
        exit 1
    fi
fi

# Wait for Redis
if [ "$redis_running" = false ]; then
    echo -ne "${YELLOW}Waiting for Redis to be ready${NC}"
    attempts=0
    while ! check_service "Redis" 6382 && [ $attempts -lt 30 ]; do
        sleep 1
        attempts=$((attempts + 1))
        echo -n "."
    done
    echo ""
    
    if check_service "Redis" 6382; then
        echo -e "${GREEN}✓ Redis started successfully${NC}"
    else
        echo -e "${RED}✗ Redis failed to start${NC}"
        docker-compose logs redis | tail -10
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}Dependencies started successfully!${NC}"

# Show container status
echo ""
echo -e "${CYAN}Container status:${NC}"
docker-compose ps postgres redis

# Show connection info
echo ""
echo -e "${CYAN}Connection Information:${NC}"
echo -e "PostgreSQL: ${GREEN}postgres://postgres:postgres@localhost:5434/bookmarks${NC}"
echo -e "Redis:      ${GREEN}redis://localhost:6382${NC}"