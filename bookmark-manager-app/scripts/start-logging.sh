#!/bin/bash
# Start logging system with different modes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default mode
MODE=${1:-basic}

echo -e "${BLUE}Starting logging system in $MODE mode...${NC}"

# Function to check if service is running
check_service() {
    local service=$1
    local port=$2
    nc -z localhost $port 2>/dev/null
}

# Create necessary directories
mkdir -p logs/structured
touch logs/unified.log
touch /tmp/rust-services.log

case "$MODE" in
    basic)
        echo -e "${GREEN}Basic mode: File-based logging only${NC}"
        
        # Just start Vector with basic file outputs
        if ! check_service "vector" 8686; then
            echo -e "${YELLOW}Starting Vector...${NC}"
            vector --config vector.toml > logs/vector.log 2>&1 &
            sleep 3
        fi
        
        echo -e "${GREEN}Basic logging ready!${NC}"
        echo "Logs available at:"
        echo "  - logs/unified.log"
        echo "  - logs/structured/*.json"
        ;;
        
    postgres)
        echo -e "${GREEN}PostgreSQL mode: Files + Database logging${NC}"
        
        # Build and start log-writer if not running
        if ! check_service "log-writer" 8688; then
            echo -e "${YELLOW}Building log-writer service...${NC}"
            cd rust-backend/services/log-writer
            cargo build --release
            cd ../../..
            
            echo -e "${YELLOW}Starting log-writer...${NC}"
            ./rust-backend/target/release/log-writer > logs/log-writer.log 2>&1 &
            sleep 3
        fi
        
        # Start Vector with PostgreSQL sink enabled
        if ! check_service "vector" 8686; then
            echo -e "${YELLOW}Starting Vector...${NC}"
            # Create a temp config that enables PostgreSQL sink
            sed 's/# \[sinks.postgres_logs\]/[sinks.postgres_logs]/' vector-hybrid.toml > vector-postgres.toml
            vector --config vector-postgres.toml > logs/vector.log 2>&1 &
            sleep 3
        fi
        
        echo -e "${GREEN}PostgreSQL logging ready!${NC}"
        echo "Logs available at:"
        echo "  - logs/unified.log"
        echo "  - logs/structured/*.json"
        echo "  - PostgreSQL: application_logs table"
        ;;
        
    hybrid)
        echo -e "${GREEN}Hybrid mode: Full PostgreSQL + Elasticsearch${NC}"
        ./scripts/setup-hybrid-logging.sh
        ;;
        
    *)
        echo -e "${RED}Unknown mode: $MODE${NC}"
        echo "Usage: $0 [basic|postgres|hybrid]"
        echo "  basic    - File-based logging only (default)"
        echo "  postgres - Files + PostgreSQL"
        echo "  hybrid   - Full setup with Elasticsearch"
        exit 1
        ;;
esac