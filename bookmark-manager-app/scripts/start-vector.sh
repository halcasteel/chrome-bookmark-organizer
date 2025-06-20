#!/bin/bash
# Start Vector for unified logging

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Vector for unified logging...${NC}"

# Check if Vector is installed
if ! command -v vector &> /dev/null; then
    echo -e "${RED}Vector is not installed. Please run: ./scripts/install-vector.sh${NC}"
    exit 1
fi

# Create necessary directories and files
mkdir -p logs/structured
touch logs/unified.log
touch /tmp/rust-services.log

# Apply database migration for logs table
echo -e "${YELLOW}Applying logs table migration...${NC}"
PGPASSWORD=admin psql -h localhost -p 5434 -U admin -d bookmark_manager < database/migrations/007_application_logs.sql

# Check if Vector is already running
if pgrep -x "vector" > /dev/null; then
    echo -e "${YELLOW}Vector is already running. Restarting...${NC}"
    pkill -x vector || true
    sleep 2
fi

# Start Vector
echo -e "${GREEN}Starting Vector with configuration...${NC}"
vector --config vector.toml &

# Wait for Vector to start
sleep 3

# Check if Vector started successfully
if pgrep -x "vector" > /dev/null; then
    echo -e "${GREEN}Vector started successfully!${NC}"
    echo ""
    echo "Vector endpoints:"
    echo "  API:      http://localhost:8686"
    echo "  Frontend: http://localhost:8687/logs"
    echo "  Syslog:   localhost:5514"
    echo "  Metrics:  http://localhost:9598/metrics"
    echo ""
    echo "Log files:"
    echo "  Unified:     logs/unified.log"
    echo "  Structured:  logs/structured/*.json"
    echo ""
    echo "To stop Vector: pkill vector"
else
    echo -e "${RED}Failed to start Vector${NC}"
    exit 1
fi